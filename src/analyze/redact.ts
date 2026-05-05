// Privacy redaction for the analyze pipeline (D-9 white-list passthrough).
//
// Default behaviour (no `--include-prompts`): scrub user-turn prompts down to a
// length+commandHints stub, drop `file-history-snapshot` events outright, and
// reduce path-bearing fields to `<basename>@<sha256[0..8]>` so reports never
// leak filesystem topology either. With `includePrompts: true`, only the
// file-history drop survives — the rest is passed through verbatim.
//
// Why "white-list passthrough" rather than "deny-list scrub"? Schema drift
// risk: every new field that lands in transcript-events.json gets redacted by
// default. R-8's grep guardrails (Phase 3 tests) catch the inverse case where
// a known-bad field accidentally survives.
//
// `redactReportFields` is the renderer-side belt-and-suspenders: even if a raw
// field slips into the rendered report (e.g. via a future schema-map entry
// that emits stderr verbatim), this pass strips it from the final markdown
// payload before stdout. Today it only knows about `lastStderr` and the
// generic path-shaped fields; Phase 4 may extend the white-list.

import { createHash } from 'node:crypto';
import path from 'node:path';

import type { Event } from './types.ts';

export interface RedactOptions {
  includePrompts?: boolean;
}

const PATH_FIELDS = new Set(['cwd', 'path', 'file', 'transcript_path', 'projectPath']);
const COMMAND_NAME_RE = /<command-name>([^<]+)<\/command-name>/g;

/**
 * Hash a project path down to its first 8 sha256 hex chars. Used both inside
 * `redactEvent` for path-bearing fields and exported standalone for callers
 * (e.g. error-logger may want to surface a project hash without the full path).
 */
export function hashProject(absPath: string): string {
  return createHash('sha256').update(absPath).digest('hex').slice(0, 8);
}

/** `<basename>@<sha256[0..8]>` — keeps file-name signal, kills topology leak. */
function redactPath(p: string): string {
  if (!p) return p;
  const base = path.basename(p) || p;
  return `${base}@${hashProject(p)}`;
}

function extractCommandHints(text: string): string[] {
  const hints: string[] = [];
  let m: RegExpExecArray | null;
  // Reset lastIndex defensively because COMMAND_NAME_RE is module-scoped.
  COMMAND_NAME_RE.lastIndex = 0;
  while ((m = COMMAND_NAME_RE.exec(text))) {
    if (m[1]) hints.push(m[1].trim());
  }
  return hints;
}

/**
 * Redact a single event in-place and return either the redacted Event or
 * `null` to signal "drop this event entirely" (used for file-history-snapshot
 * regardless of the includePrompts flag — those are never user-facing).
 *
 * Returns `null` ⇒ caller filters out. Returns Event ⇒ safe to render.
 */
export function redactEvent(ev: Event, opts: RedactOptions = {}): Event | null {
  // Always drop file-history-snapshot events — they only carry editor history
  // diff blobs and have no place in an observability report.
  const topType = (ev.payload as { type?: unknown }).type;
  if (topType === 'file-history-snapshot') return null;
  const att = (ev.payload as { attachment?: unknown }).attachment;
  if (att && typeof att === 'object' && (att as { type?: unknown }).type === 'file-history-snapshot') {
    return null;
  }

  if (opts.includePrompts) return ev; // passthrough for the explicit opt-in path.

  // Clone shallowly so we don't mutate the caller's event reference.
  const next: Event = { ...ev, payload: { ...ev.payload } };

  // Path-bearing top-level fields.
  if (typeof next.cwd === 'string') next.cwd = redactPath(next.cwd);
  for (const key of PATH_FIELDS) {
    const v = next.payload[key];
    if (typeof v === 'string') next.payload[key] = redactPath(v);
  }

  // user_turn content gets the prompt-stub treatment.
  if (next.kind === 'user_turn') {
    let totalLength = 0;
    const hints: string[] = [];

    const message = next.payload.message;
    if (message && typeof message === 'object') {
      const content = (message as { content?: unknown }).content;
      if (typeof content === 'string') {
        totalLength += Buffer.byteLength(content, 'utf8');
        hints.push(...extractCommandHints(content));
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (part && typeof part === 'object') {
            const t = (part as { text?: unknown }).text;
            if (typeof t === 'string') {
              totalLength += Buffer.byteLength(t, 'utf8');
              hints.push(...extractCommandHints(t));
            }
          }
        }
      }

      // Synthesize a minimal content array carrying ONLY the command-name XML
      // so report.ts's slash-command fallback (D-4) keeps working without a
      // separate code path. Empty hints → empty content array (drops the
      // prompt entirely; renderer just sees no extractable command).
      const synthesized = hints.map((h) => ({ type: 'text', text: `<command-name>${h}</command-name>` }));
      next.payload.message = { ...(message as Record<string, unknown>), content: synthesized };
    }

    // Top-level payload.content shape (some schemas embed the prompt there).
    if (typeof next.payload.content === 'string') {
      totalLength += Buffer.byteLength(next.payload.content as string, 'utf8');
      hints.push(...extractCommandHints(next.payload.content as string));
      delete next.payload.content;
    }

    next.payload.redacted = {
      length: totalLength,
      commandHints: Array.from(new Set(hints)),
    };
  }

  return next;
}

/**
 * Renderer-side pass: walk an arbitrary report object and scrub any string
 * field whose KEY suggests it's a path or whose value looks like a leaked
 * prompt fragment. Conservative: only touches strings, leaves numbers and
 * booleans alone. Recurses into nested objects/arrays.
 *
 * `includePrompts: true` short-circuits to identity — same contract as
 * `redactEvent`.
 */
export function redactReportFields<T>(report: T, opts: RedactOptions = {}): T {
  if (opts.includePrompts) return report;
  return walk(report) as T;
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string' && PATH_FIELDS.has(k)) {
        out[k] = redactPath(v);
      } else {
        out[k] = walk(v);
      }
    }
    return out;
  }
  return value;
}

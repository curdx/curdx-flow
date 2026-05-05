// Renderer for `analyze` — produces both markdown and a JSON shape.
//
// Phase 2 Task 2.2: split off the inline POC renderer in index.ts and grow it
// into 7 sections. The orchestrator collects events + sidecar inputs (errors
// log, spec states, schema-drift counters) and hands them here. We never
// reach back into the filesystem — keeps this module pure and testable.
//
// Section index:
//   1. Hook Failures Top-N           — FR-7  / AC-1.1 / AC-1.2
//      • from events `kind=hook_invocation && exitCode!==0`
//      • merged with errors.jsonl entries (R-9 fuzzy join: hook + ts±2s + cwd)
//   2. Slash Commands                — FR-7  / AC-2.1 / D-4
//      • from assistant_turn.attributionSkill
//      • fallback: <command-name>...</command-name> XML in user_turn.content
//   3. Subagents                     — AC-3.1
//      • from tool_call where name === 'Agent', read input.subagent_type
//   4. Spec Funnel                   — AC-4.1
//      • specStates passed in by orchestrator (it scans ./specs/*/.curdx-state.json)
//   5. Hook Duration P50/P95/P99     — AC-5.1 (linear-interpolation percentiles,
//      no numjs); samples < 5 → "(样本不足: N)"
//   6. Schema Drift                  — AC-6.1
//      • passed in via opts.schemaDrift (parser.ts owns the counters)
//   7. Parent Chain                  — AC-6.1
//      • parentUuid_broken_ratio across event uuids; fixture-friendly fallback
//        when no parentUuid data is present
//
// The same data also surfaces under `--json` via the `markdown / json` pair
// returned by renderReport(). report.ts MUST stay pure so tests (Phase 4)
// can exercise it on synthetic event arrays without filesystem mocking.

import type { Event, Options } from './types.ts';

export interface ErrorLogEntry {
  ts: string;
  hook?: string;
  event?: string;
  msg?: string;
  cwd?: string;
  transcript_path?: string;
}

export interface SpecStateInfo {
  name: string;
  phase: string; // research / requirements / design / tasks / execution / done
}

export interface SchemaDriftInput {
  unknownTypeCount: number;
  parseErrorCount: number;
}

export interface RenderOptions extends Options {
  schemaDrift: SchemaDriftInput;
}

interface HookFailureRow {
  hook: string;
  count: number;
  lastStderr: string;
  source: 'jsonl' | 'errors.jsonl' | 'merged';
}

interface SlashRow {
  command: string;
  count: number;
}

interface SubagentRow {
  subagent: string;
  count: number;
}

interface FunnelRow {
  phase: string;
  count: number;
}

interface DurationRow {
  hook: string;
  samples: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

interface ParentChainSummary {
  totalEvents: number;
  withParent: number;
  brokenLinks: number;
  brokenRatio: number;
  hasData: boolean;
}

export interface ReportJson {
  hookFailures: HookFailureRow[];
  slashCommands: SlashRow[];
  subagents: SubagentRow[];
  specFunnel: FunnelRow[];
  hookDuration: DurationRow[];
  schemaDrift: { unknownTypeCount: number; parseErrorCount: number };
  parentChain: ParentChainSummary;
}

export interface RenderResult {
  markdown: string;
  json: ReportJson;
}

const DEFAULT_LIMIT = 10;
const STDERR_TRUNC = 200;
const FUZZY_TS_WINDOW_MS = 2000;
const MIN_SAMPLES_FOR_PCT = 5;
const COMMAND_NAME_RE = /<command-name>([^<]+)<\/command-name>/;

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function truncate(s: string | undefined, max = STDERR_TRUNC): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max);
}

/**
 * Section 1 — Hook Failures.
 *
 * Pulls failures from two sources and fuzzy-merges them by `(hook, ts±2s, cwd)`.
 * jsonl-sourced rows win on ties because they carry richer fields (durationMs,
 * full stderr). errors.jsonl rows that don't pair with a jsonl row are kept
 * standalone (R-9 — both sources can record events the other missed).
 */
function rollupHookFailures(events: Event[], errors: ErrorLogEntry[], limit: number): HookFailureRow[] {
  type Bucket = { hook: string; ts: number; cwd?: string; stderr: string; source: HookFailureRow['source'] };
  const buckets: Bucket[] = [];

  for (const ev of events) {
    if (ev.kind !== 'hook_invocation') continue;
    const att = (ev.payload as { attachment?: unknown }).attachment;
    if (!att || typeof att !== 'object') continue;
    const a = att as { type?: unknown; hookName?: unknown; exitCode?: unknown; stderr?: unknown };
    if (a.type !== 'hook_success') continue;
    const hookName = typeof a.hookName === 'string' ? a.hookName : undefined;
    const exitCode = typeof a.exitCode === 'number' ? a.exitCode : undefined;
    if (!hookName || exitCode === undefined || exitCode === 0) continue;
    const stderr = truncate(typeof a.stderr === 'string' ? a.stderr : '');
    const tsMs = ev.ts ? Date.parse(ev.ts) : NaN;
    buckets.push({
      hook: hookName,
      ts: Number.isFinite(tsMs) ? tsMs : 0,
      ...(ev.cwd ? { cwd: ev.cwd } : {}),
      stderr,
      source: 'jsonl',
    });
  }

  for (const e of errors) {
    if (!e.hook) continue;
    const tsMs = e.ts ? Date.parse(e.ts) : NaN;
    const cwd = e.cwd;
    const tsResolved = Number.isFinite(tsMs) ? tsMs : 0;

    // Try fuzzy merge: same hook, ts within ±2s, cwd matches (or both missing).
    const dup = buckets.find(
      (b) =>
        b.hook === e.hook &&
        Math.abs(b.ts - tsResolved) <= FUZZY_TS_WINDOW_MS &&
        (b.cwd ?? '') === (cwd ?? ''),
    );
    if (dup) {
      // jsonl wins on stderr/durationMs; mark merged so consumers know it's both.
      dup.source = 'merged';
      continue;
    }
    buckets.push({
      hook: e.hook,
      ts: tsResolved,
      ...(cwd ? { cwd } : {}),
      stderr: truncate(e.msg ?? ''),
      source: 'errors.jsonl',
    });
  }

  // Roll up into per-hook counts.
  const counts = new Map<string, { count: number; lastStderr: string; source: HookFailureRow['source'] }>();
  for (const b of buckets) {
    const prev = counts.get(b.hook);
    if (prev) {
      prev.count += 1;
      if (b.stderr) prev.lastStderr = b.stderr;
      if (prev.source !== b.source) prev.source = 'merged';
    } else {
      counts.set(b.hook, { count: 1, lastStderr: b.stderr, source: b.source });
    }
  }

  const rows = Array.from(counts.entries())
    .map(([hook, v]) => ({ hook, count: v.count, lastStderr: v.lastStderr, source: v.source }))
    .sort((a, b) => b.count - a.count);
  return rows.slice(0, limit);
}

function renderHookFailures(rows: HookFailureRow[], limit: number): string {
  const lines: string[] = [];
  lines.push(`## Hook Failures Top-${limit}`);
  lines.push('');
  if (rows.length === 0) {
    lines.push('_No hook failures recorded._');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('| Hook | Count | Last stderr | Source |');
  lines.push('| --- | --- | --- | --- |');
  for (const r of rows) {
    lines.push(`| ${escapeCell(r.hook)} | ${r.count} | ${escapeCell(r.lastStderr)} | ${r.source} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Section 2 — Slash Commands.
 *
 * Two-source roll-up:
 *   • Primary: assistant_turn.attributionSkill (when Claude Code labels the
 *     turn as belonging to a slash skill).
 *   • Fallback (D-4): user_turn.content carrying `<command-name>...</command-name>`
 *     XML — what /<plugin>:<skill> typed by the user looks like before
 *     Claude Code attributes it.
 *
 * The XML fallback is critical: in fixture transcripts and older Claude Code
 * versions, attributionSkill is absent but the user message still shows the
 * intended skill. Without this fallback section 2 is empty for the fixture
 * and the FR-7 verification pinches.
 */
function rollupSlashCommands(events: Event[], limit: number): SlashRow[] {
  const counts = new Map<string, number>();

  for (const ev of events) {
    if (ev.kind === 'assistant_turn') {
      const skill = (ev.payload as { attributionSkill?: unknown }).attributionSkill;
      if (typeof skill === 'string' && skill.length > 0) {
        counts.set(skill, (counts.get(skill) ?? 0) + 1);
      }
      continue;
    }
    if (ev.kind === 'user_turn') {
      const message = (ev.payload as { message?: unknown }).message;
      if (!message || typeof message !== 'object') continue;
      const content = (message as { content?: unknown }).content;
      const texts: string[] = [];
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part && typeof part === 'object') {
            const t = (part as { text?: unknown }).text;
            if (typeof t === 'string') texts.push(t);
          }
        }
      } else if (typeof content === 'string') {
        texts.push(content);
      }
      for (const t of texts) {
        const m = COMMAND_NAME_RE.exec(t);
        if (m && m[1]) {
          const cmd = m[1].trim();
          if (cmd) counts.set(cmd, (counts.get(cmd) ?? 0) + 1);
        }
      }
    }
  }

  const rows = Array.from(counts.entries())
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count);
  return rows.slice(0, limit);
}

function renderSlashCommands(rows: SlashRow[], limit: number): string {
  const lines: string[] = [];
  lines.push(`## Slash Commands Top-${limit}`);
  lines.push('');
  if (rows.length === 0) {
    lines.push('_No slash command activity recorded._');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('| Command | Count |');
  lines.push('| --- | --- |');
  for (const r of rows) {
    lines.push(`| ${escapeCell(r.command)} | ${r.count} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Section 3 — Subagents.
 *
 * Counts tool_call events whose tool is the Task/Agent dispatcher and pulls
 * input.subagent_type out of the message envelope.
 */
function rollupSubagents(events: Event[], limit: number): SubagentRow[] {
  const counts = new Map<string, number>();
  for (const ev of events) {
    if (ev.kind !== 'tool_call' && ev.kind !== 'assistant_turn') continue;
    // tool_use rows live nested inside assistant.message.content[*].type === 'tool_use'.
    // The schema-map currently classifies bare tool_use rows as 'tool_call';
    // for our fixture (and Claude Code real transcripts), they live INSIDE
    // assistant_turn payloads. We walk both shapes.
    const message = (ev.payload as { message?: unknown }).message;
    if (message && typeof message === 'object') {
      const content = (message as { content?: unknown }).content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (!part || typeof part !== 'object') continue;
          const p = part as { type?: unknown; name?: unknown; input?: unknown };
          if (p.type !== 'tool_use') continue;
          if (p.name !== 'Agent' && p.name !== 'Task') continue;
          const input = p.input as { subagent_type?: unknown } | undefined;
          const sub = input && typeof input.subagent_type === 'string' ? input.subagent_type : undefined;
          if (sub) counts.set(sub, (counts.get(sub) ?? 0) + 1);
        }
      }
    }
    // Also handle the flatter shape where the raw row already is a tool_use line.
    const direct = ev.payload as { name?: unknown; input?: unknown };
    if (direct.name === 'Agent' || direct.name === 'Task') {
      const input = direct.input as { subagent_type?: unknown } | undefined;
      const sub = input && typeof input.subagent_type === 'string' ? input.subagent_type : undefined;
      if (sub) counts.set(sub, (counts.get(sub) ?? 0) + 1);
    }
  }

  const rows = Array.from(counts.entries())
    .map(([subagent, count]) => ({ subagent, count }))
    .sort((a, b) => b.count - a.count);
  return rows.slice(0, limit);
}

function renderSubagents(rows: SubagentRow[], limit: number): string {
  const lines: string[] = [];
  lines.push(`## Subagents Top-${limit}`);
  lines.push('');
  if (rows.length === 0) {
    lines.push('_No subagent dispatches recorded._');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('| Subagent | Count |');
  lines.push('| --- | --- |');
  for (const r of rows) {
    lines.push(`| ${escapeCell(r.subagent)} | ${r.count} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Section 4 — Spec Funnel.
 *
 * The orchestrator scans ./specs/*\/.curdx-state.json and hands us the raw
 * phase strings. We just bucket + render in the canonical phase order;
 * unknown phases (e.g. legacy values) bucket under their own row.
 */
const PHASE_ORDER = ['research', 'requirements', 'design', 'tasks', 'execution', 'done'];

function rollupSpecFunnel(specStates: SpecStateInfo[]): FunnelRow[] {
  const counts = new Map<string, number>();
  for (const s of specStates) {
    counts.set(s.phase, (counts.get(s.phase) ?? 0) + 1);
  }
  const rows: FunnelRow[] = [];
  for (const p of PHASE_ORDER) {
    rows.push({ phase: p, count: counts.get(p) ?? 0 });
    counts.delete(p);
  }
  // Tail in any non-canonical phases (sorted for stability).
  for (const [phase, count] of Array.from(counts.entries()).sort()) {
    rows.push({ phase, count });
  }
  return rows;
}

function renderSpecFunnel(rows: FunnelRow[]): string {
  const lines: string[] = [];
  lines.push('## Spec Funnel');
  lines.push('');
  lines.push('| Phase | Count |');
  lines.push('| --- | --- |');
  for (const r of rows) {
    lines.push(`| ${escapeCell(r.phase)} | ${r.count} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Section 5 — Hook Duration P50/P95/P99.
 *
 * Linear-interpolation percentile (no numjs dep — NFR-4).
 *   percentile(p) on sorted array of length n:
 *     index = ceil(p * n) - 1  (clamped to [0, n-1])
 * For n < 5 we render "(样本不足: N)" instead of a misleading number — N is
 * tiny enough that the percentile would be either the min or max value.
 */
function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const n = sortedAsc.length;
  const idx = Math.min(Math.max(Math.ceil(p * n) - 1, 0), n - 1);
  return sortedAsc[idx] ?? null;
}

function rollupHookDuration(events: Event[]): DurationRow[] {
  const samples = new Map<string, number[]>();
  for (const ev of events) {
    if (ev.kind !== 'hook_invocation') continue;
    const att = (ev.payload as { attachment?: unknown }).attachment;
    if (!att || typeof att !== 'object') continue;
    const a = att as { type?: unknown; hookName?: unknown; durationMs?: unknown };
    if (a.type !== 'hook_success') continue;
    const hookName = typeof a.hookName === 'string' ? a.hookName : undefined;
    const dur = typeof a.durationMs === 'number' ? a.durationMs : undefined;
    if (!hookName || dur === undefined) continue;
    if (!samples.has(hookName)) samples.set(hookName, []);
    samples.get(hookName)!.push(dur);
  }

  const rows: DurationRow[] = [];
  for (const [hook, arr] of samples.entries()) {
    arr.sort((a, b) => a - b);
    rows.push({
      hook,
      samples: arr.length,
      p50: percentile(arr, 0.5),
      p95: percentile(arr, 0.95),
      p99: percentile(arr, 0.99),
    });
  }
  rows.sort((a, b) => b.samples - a.samples);
  return rows;
}

function renderHookDuration(rows: DurationRow[]): string {
  const lines: string[] = [];
  lines.push('## Hook Duration');
  lines.push('');
  if (rows.length === 0) {
    lines.push('_No hook duration samples recorded._');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('| Hook | Samples | P50 (ms) | P95 (ms) | P99 (ms) |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const r of rows) {
    if (r.samples < MIN_SAMPLES_FOR_PCT) {
      lines.push(`| ${escapeCell(r.hook)} | ${r.samples} | (样本不足: ${r.samples}) | (样本不足: ${r.samples}) | (样本不足: ${r.samples}) |`);
    } else {
      lines.push(`| ${escapeCell(r.hook)} | ${r.samples} | ${r.p50 ?? '-'} | ${r.p95 ?? '-'} | ${r.p99 ?? '-'} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Section 6 — Schema Drift.
 *
 * Always renders, even when both counts are 0 — visibility of "no drift" is
 * itself the success state. The hint line teaches the user what to do when
 * counts go non-zero (AC-6.1).
 */
function renderSchemaDrift(input: SchemaDriftInput): string {
  const lines: string[] = [];
  lines.push('## Schema Drift');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| unknown_type_count | ${input.unknownTypeCount} |`);
  lines.push(`| parse_error_count | ${input.parseErrorCount} |`);
  lines.push('');
  if (input.unknownTypeCount > 0 || input.parseErrorCount > 0) {
    lines.push('_Hint: 如长期 > 0 表明 Claude Code 升级了 schema，请检查 plugins/curdx-flow/schemas/transcript-events.json_');
  } else {
    lines.push('_no drift detected_');
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Section 7 — Parent Chain.
 *
 * For each event with `parentUuid`, check whether its parent uuid is also
 * present in the event set; missing parents = broken links. The fixture
 * intentionally has no parentUuid fields, so this section emits a friendly
 * "(no parent chain data)" placeholder rather than a misleading 0/0.
 */
function rollupParentChain(events: Event[]): ParentChainSummary {
  const uuids = new Set<string>();
  for (const ev of events) {
    if (ev.uuid) uuids.add(ev.uuid);
  }

  let withParent = 0;
  let broken = 0;
  for (const ev of events) {
    const p = (ev.payload as { parentUuid?: unknown }).parentUuid;
    if (typeof p === 'string' && p.length > 0) {
      withParent += 1;
      if (!uuids.has(p)) broken += 1;
    }
  }

  return {
    totalEvents: events.length,
    withParent,
    brokenLinks: broken,
    brokenRatio: withParent === 0 ? 0 : broken / withParent,
    hasData: withParent > 0,
  };
}

function renderParentChain(s: ParentChainSummary): string {
  const lines: string[] = [];
  lines.push('## Parent Chain');
  lines.push('');
  if (!s.hasData) {
    lines.push('_(no parent chain data)_');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| total_events | ${s.totalEvents} |`);
  lines.push(`| events_with_parent | ${s.withParent} |`);
  lines.push(`| broken_links | ${s.brokenLinks} |`);
  lines.push(`| parentUuid_broken_ratio | ${s.brokenRatio.toFixed(4)} |`);
  lines.push('');
  return lines.join('\n');
}

export function renderReport(
  events: Event[],
  errorEntries: ErrorLogEntry[],
  specStates: SpecStateInfo[],
  opts: RenderOptions,
): RenderResult {
  const limit = typeof opts.limit === 'number' && opts.limit > 0 ? opts.limit : DEFAULT_LIMIT;

  const hookFailures = rollupHookFailures(events, errorEntries, limit);
  const slashCommands = rollupSlashCommands(events, limit);
  const subagents = rollupSubagents(events, limit);
  const specFunnel = rollupSpecFunnel(specStates);
  const hookDuration = rollupHookDuration(events);
  const parentChain = rollupParentChain(events);

  const markdown =
    renderHookFailures(hookFailures, limit) +
    '\n' +
    renderSlashCommands(slashCommands, limit) +
    '\n' +
    renderSubagents(subagents, limit) +
    '\n' +
    renderSpecFunnel(specFunnel) +
    '\n' +
    renderHookDuration(hookDuration) +
    '\n' +
    renderSchemaDrift(opts.schemaDrift) +
    '\n' +
    renderParentChain(parentChain);

  const json: ReportJson = {
    hookFailures,
    slashCommands,
    subagents,
    specFunnel,
    hookDuration,
    schemaDrift: {
      unknownTypeCount: opts.schemaDrift.unknownTypeCount,
      parseErrorCount: opts.schemaDrift.parseErrorCount,
    },
    parentChain,
  };

  return { markdown, json };
}

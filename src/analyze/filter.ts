// Event filter: dedupe + time window + Top-N.
//
// D-2 dedupe key: `uuid + requestId` composite — same uuid replayed across
// retries gets a different requestId in v2.1.126+ transcripts, so the
// composite catches duplicates without collapsing legitimate retries.
// D-3 fallback: when requestId is absent (v2.1.119 and earlier), degrade to
// uuid-only — coarser dedupe, but does not throw / does not drop the row.

import type { Event, Options } from './types.ts';

/**
 * Parse `--since` value: `7d` / `30d` (relative days) or `YYYY-MM-DD`
 * (absolute ISO date). Returns Date or undefined for unrecognized strings.
 */
function parseSince(since: string | undefined): Date | undefined {
  if (!since) return undefined;
  const m = /^(\d+)d$/.exec(since);
  if (m) {
    const days = Number(m[1]);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
  // ISO date — let Date parse and validate.
  const d = new Date(since);
  if (!Number.isNaN(d.getTime())) return d;
  return undefined;
}

/**
 * Apply dedupe + --since + --limit + --project to a fully-collected event
 * array. Stays array-based (not iterable) because Top-N requires sorting,
 * which needs the full set anyway.
 *
 *   • dedupe: `Set<string>` keyed on `uuid|requestId` (or uuid only when
 *     requestId is missing — D-3); rows with neither uuid nor requestId
 *     pass through (filter is best-effort, not a guard).
 *   • --since: drop events with `ts < since`.
 *   • --project: not yet enabled (Task 4.1 wires cwd inference); the
 *     parameter is accepted to keep the signature stable.
 *   • --limit: sort by ts desc, slice(0, limit). Most-recent-first matches
 *     report.ts Top-N expectations.
 */
export function filterEvents(events: Event[], opts: Options): Event[] {
  const sinceDate = parseSince(opts.since);
  const seen = new Set<string>();
  const out: Event[] = [];

  for (const ev of events) {
    if (sinceDate && ev.ts) {
      const evDate = new Date(ev.ts);
      if (!Number.isNaN(evDate.getTime()) && evDate < sinceDate) continue;
    }

    const dedupeKey = computeDedupeKey(ev);
    if (dedupeKey !== undefined) {
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
    }

    // --project: signature accepted; semantics deferred to Task 4.1.
    void opts.project;

    out.push(ev);
  }

  // Most-recent first — stable for ties via Array.sort default behaviour.
  out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));

  if (typeof opts.limit === 'number' && opts.limit > 0) {
    return out.slice(0, opts.limit);
  }
  return out;
}

function computeDedupeKey(ev: Event): string | undefined {
  if (ev.uuid && ev.requestId) return `${ev.uuid}|${ev.requestId}`;
  if (ev.uuid) return ev.uuid;
  // No uuid → cannot dedupe; let it through (this is a real event we just
  // can't pair with anything else).
  return undefined;
}

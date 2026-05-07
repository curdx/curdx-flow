// OB-3 cost analytics — single-row USD compute + assistant-turn extraction.
//
// Phase 1 scope (Task 1.3): just `computeCost` and the main-path
// `extractUsageRowsFromEvents` that walks `assistant_turn` events and reads
// the nested `payload.message.usage` block. Subagent `<usage>` trailer
// parsing (Decision 11/12) is wired in Task 2.2 / 2.3; three-level
// `aggregateBy` lands in Task 2.5. This file deliberately holds only the
// minimum surface needed for the POC milestone (Task 1.7) — the
// `--cost-summary --json | jq '.totalCost.usd'` smoke gate.
//
// Hard contracts (carried from NFR-3 / NFR-5 / NFR-9):
//   • zero npm runtime deps — only imports `pricing.ts` + `types.ts`
//   • NEVER-throw — `extractUsageRowsFromEvents` wraps the per-event read
//     in try/catch; one malformed event drops that single row, the rest
//     of the array is preserved. `computeCost` is total over its domain
//     (numeric inputs default to 0, unknown model returns 0).
//   • cost rounded to 4 decimals at the boundary (Decision 6 / Decision 10)
//     — callers aggregating across rows should re-round at the render
//     layer; per-row 4-decimal rounding here covers the ±0.001 USD AC3
//     precision target with a 10× safety margin.

import { PRICING, resolveModelId, type ModelPrice } from './pricing.js';
import type { AggregateBucket, Event, EventLogRow, UsageRow } from './types.js';

/**
 * Round a USD figure to 4 decimal places ($0.0001 grid).
 *
 * Decision 10 — covers the ±0.001 USD AC3 acceptance with a 10× buffer.
 * `Math.round(x * 10000) / 10000` is the standard JS half-up trick;
 * good enough at the magnitudes we care about (per-row USD ≪ 1.0).
 */
function round4(usd: number): number {
  return Math.round(usd * 10000) / 10000;
}

/**
 * computeCost — per-row USD from a single UsageRow.
 *
 * Formula (FR-COST-1):
 *   USD = (input · base
 *        + cache5m · 1.25 · base
 *        + cache1h · 2.0  · base
 *        + cacheRead · 0.1 · base
 *        + output · out) / 1_000_000
 *
 * Where `base` = `inputPerMTok` and `out` = `outputPerMTok` from
 * `pricing.ts#PRICING`. Multipliers (`cache5mWriteMul` / `cache1hWriteMul`
 * / `cacheReadMul`) come from the same table so a future pricing schema
 * shift propagates here without code edits.
 *
 * Unknown model → returns 0 (the caller decides whether to skip the row
 * or surface the gap; this function never throws).
 */
export function computeCost(row: UsageRow): number {
  const canonical = resolveModelId(row.model);
  if (!canonical) return 0;
  const price: ModelPrice | undefined = PRICING[canonical];
  if (!price) return 0;

  const input = row.inputTokens ?? 0;
  const output = row.outputTokens ?? 0;
  const cacheRead = row.cacheReadTokens ?? 0;
  const cache5m = row.cacheCreate5mTokens ?? 0;
  const cache1h = row.cacheCreate1hTokens ?? 0;

  const usd =
    (input * price.inputPerMTok +
      cache5m * price.cache5mWriteMul * price.inputPerMTok +
      cache1h * price.cache1hWriteMul * price.inputPerMTok +
      cacheRead * price.cacheReadMul * price.inputPerMTok +
      output * price.outputPerMTok) /
    1_000_000;

  return round4(usd);
}

/**
 * Read a nested numeric field from an opaque payload object.
 *
 * Walks a dotted path (`message.usage.input_tokens`) over an arbitrary
 * record-of-unknown without throwing on missing intermediate keys. Returns
 * 0 for any miss — non-numeric leaves coerce to 0 too. This is the
 * `?? 0` cascade promised by FR-PARSER-3 (backward compat for older
 * schemas that lack the `cache_creation` nested object).
 */
function readNumber(obj: Record<string, unknown> | undefined, dottedPath: string): number {
  if (!obj) return 0;
  const parts = dottedPath.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return 0;
    }
  }
  return typeof cur === 'number' && Number.isFinite(cur) ? cur : 0;
}

/**
 * Read a string field at a dotted path; `undefined` for any miss.
 *
 * Used for `payload.message.model` extraction — the only string-valued
 * nested usage field in the assistant_turn payload schema (design §4
 * schema-map advisory).
 */
function readString(
  obj: Record<string, unknown> | undefined,
  dottedPath: string,
): string | undefined {
  if (!obj) return undefined;
  const parts = dottedPath.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * Subagent `<usage>` trailer regex — design-locked (design §Components #2).
 *
 * Matches the text-embedded usage block that subagents emit in
 * `tool_result.content[].text`:
 *
 *   <usage>
 *   total_tokens: 8200
 *   tool_uses: 14
 *   duration_ms: 9450
 *   </usage>
 *
 * `[\s\S]*?` is the cross-line non-greedy class — research §Trailer JSON-escape
 * implementation showed the literal "\n" in the JSON-string form does not match
 * with `.` even under `s` flag in some Node versions, so `[\s\S]` is the
 * portable choice. Global flag captures every trailer in a multi-trailer text
 * (session 5b0d961c peak: 181 trailers in a single tool_result).
 */
const TRAILER_RE =
  /<usage>[\s\S]*?total_tokens:\s*(\d+)[\s\S]*?tool_uses:\s*(\d+)[\s\S]*?duration_ms:\s*(\d+)[\s\S]*?<\/usage>/g;

/**
 * extractTrailerUsage — sidechain `<usage>` trailer → UsageRow[].
 *
 * Parses every `<usage>...</usage>` block in `text` (a single
 * `tool_result.content[].text` string from a sidechain assistant turn) and
 * emits one UsageRow per match. Decision 12: trailer tokens are attributed
 * entirely to `outputTokens` — the subagent reports its own total without
 * splitting input/output, and output-side pricing (5× input) is the safe
 * over-attribution direction (we'd rather over-count than miss).
 *
 * Inherits `ts` / `requestId` / `correlationId` from the parent assistant
 * turn so aggregateBy task-level joins via correlationId still group child
 * trailer rows under the parent task bucket. `source: 'subagent_trailer'` is
 * the discriminator that lets aggregateBy distinguish parent vs child without
 * deduping (Decision 11 — same requestId, different source = independent
 * billing channel).
 *
 * Model is set to `'unknown'` here because the trailer text doesn't carry
 * model id — `computeCost` will return 0 for the row, which is the
 * conservative-floor outcome until Task 2.3 (the wire-in step) decides
 * whether to inherit parent's model. Phase 2 task scope keeps this function
 * pure: regex → UsageRow[], no model resolution.
 *
 * NEVER-throw (NFR-9): the entire body is try/catch wrapped — a malformed
 * input string returns `[]` so the caller's row array is preserved.
 */
export function extractTrailerUsage(
  text: string,
  parent: Pick<UsageRow, 'ts' | 'requestId' | 'correlationId'>,
): UsageRow[] {
  try {
    if (typeof text !== 'string' || text.length === 0) return [];
    const rows: UsageRow[] = [];
    // Reset lastIndex defensively — TRAILER_RE is module-level so a stale
    // lastIndex from a previous call could skip matches on the same input.
    TRAILER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TRAILER_RE.exec(text)) !== null) {
      const totalTokens = parseInt(m[1] ?? '0', 10);
      const durationMs = parseInt(m[3] ?? '0', 10);
      // m[2] (tool_uses) is captured for completeness but not stored — it's
      // not on UsageRow; recommend.ts retry-loop rule (FR-RULE-8) reads
      // tool_uses from a different code path.
      rows.push({
        ts: parent.ts,
        requestId: parent.requestId,
        correlationId: parent.correlationId,
        model: 'unknown',
        inputTokens: 0,
        outputTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
        cacheReadTokens: 0,
        cacheCreate5mTokens: 0,
        cacheCreate1hTokens: 0,
        durationMs: Number.isFinite(durationMs) ? durationMs : 0,
        source: 'subagent_trailer',
      });
    }
    return rows;
  } catch {
    // NFR-9 NEVER-throw — malformed input drops to empty array.
    return [];
  }
}

/**
 * extractUsageRowsFromEvents — main path: assistant_turn → UsageRow[].
 *
 * Phase 1 scope: walks `events` looking for `kind === 'assistant_turn'`,
 * pulls the nested `payload.message.usage` block (with `cache_creation`
 * either nested or top-level fallback per FR-PARSER-3), resolves the
 * model id, and emits one row per matched event. Unknown model → drop
 * the row (no throw). Subagent trailer parsing arrives in Task 2.3 and
 * appends to the same array.
 *
 * `errorEntries` is accepted (design contract — recommend.ts will pull
 * `kind: 'ratelimit_429'` / `'retry'` rows for FR-RULE-3 / FR-RULE-8) but
 * not consumed in Phase 1 — the Phase 4 wiring keeps the same signature
 * so callers don't churn.
 *
 * NEVER-throw: every per-event read is try/catch wrapped so one
 * malformed payload drops at most that single row.
 */
export function extractUsageRowsFromEvents(
  events: Event[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed in Phase 4 (recommend.ts ratelimit/retry rules)
  errorEntries?: EventLogRow[],
): UsageRow[] {
  const rows: UsageRow[] = [];
  if (!Array.isArray(events)) return rows;

  for (const ev of events) {
    try {
      if (!ev) continue;

      // Sidechain trailer path (Decision 11 — independent billing channel).
      // `<usage>...</usage>` blocks live inside tool_result content text on
      // user_turn events: payload.message.content[].type === 'tool_result'
      // → item.content[].type === 'text' → item.content[].text. Some
      // assistant_turn payloads also surface tool_result blocks in their
      // own content arrays; we scan both shapes from the same root for
      // forward compatibility (NEVER-throw — `?.` chains drop on miss).
      //
      // Trailer rows are appended alongside the parent assistant_turn row;
      // filter.ts dedupe runs on requestId at the parser layer (parent only),
      // so trailer rows pass through untouched (Decision 11). The
      // `source: 'subagent_trailer'` discriminator on each row keeps
      // aggregateBy bucket math correct without re-deduping.
      try {
        const payloadAny = ev.payload as Record<string, unknown> | undefined;
        const message = payloadAny?.['message'] as Record<string, unknown> | undefined;
        const outerContent = message?.['content'];
        if (Array.isArray(outerContent)) {
          for (const item of outerContent) {
            // Each item may be a tool_result with a nested content array of
            // {type:'text', text:'...'} segments. Other item shapes (text,
            // tool_use) carry no trailer and are skipped silently.
            const inner = (item as Record<string, unknown> | null)?.['content'];
            if (!Array.isArray(inner)) continue;
            for (const seg of inner) {
              const text = (seg as Record<string, unknown> | null)?.['text'];
              if (typeof text !== 'string' || text.length === 0) continue;
              const trailerRows = extractTrailerUsage(text, {
                ts: ev.ts,
                requestId: ev.requestId ?? '',
                correlationId: readString(payloadAny, 'correlationId'),
              });
              if (trailerRows.length > 0) rows.push(...trailerRows);
            }
          }
        }
      } catch {
        // NFR-9 NEVER-throw — trailer scan is best-effort; one malformed
        // event drops its trailer rows but never blocks the main path.
      }

      if (ev.kind !== 'assistant_turn') continue;

      const payload = ev.payload as Record<string, unknown> | undefined;
      const model = readString(payload, 'message.model');
      const canonical = resolveModelId(model);
      if (!canonical) continue; // unknown model → skip (NEVER-throw, NFR-9)

      const usage = (payload?.['message'] as Record<string, unknown> | undefined)?.[
        'usage'
      ] as Record<string, unknown> | undefined;

      const inputTokens = readNumber(usage, 'input_tokens');
      const outputTokens = readNumber(usage, 'output_tokens');
      const cacheReadTokens = readNumber(usage, 'cache_read_input_tokens');

      // Nested `cache_creation.{ephemeral_5m,ephemeral_1h}_input_tokens` is
      // the new schema (research §Schema). Fallback path: legacy rows only
      // expose top-level `cache_creation_input_tokens` — we attribute the
      // whole legacy bucket to the 5m slot (the cheaper write tier) so we
      // don't over-bill on backward-compat data; 1h stays 0.
      let cacheCreate5mTokens = readNumber(usage, 'cache_creation.ephemeral_5m_input_tokens');
      let cacheCreate1hTokens = readNumber(usage, 'cache_creation.ephemeral_1h_input_tokens');
      if (cacheCreate5mTokens === 0 && cacheCreate1hTokens === 0) {
        const legacy = readNumber(usage, 'cache_creation_input_tokens');
        if (legacy > 0) cacheCreate5mTokens = legacy;
      }

      // requestId fallback: prefer top-level (parser sets it from raw row),
      // then `payload.message.id`, finally synthesize one. uuid follows the
      // event's own optional uuid field. correlationId is the OB-2 3-segment
      // id when the parser surfaced it onto the payload.
      const requestId =
        ev.requestId ??
        readString(payload, 'message.id') ??
        readString(payload, 'requestId') ??
        '';
      const correlationId = readString(payload, 'correlationId');
      const isSidechain = (payload?.['isSidechain'] as boolean | undefined) ?? undefined;

      rows.push({
        ts: ev.ts,
        requestId,
        uuid: ev.uuid,
        model: canonical,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreate5mTokens,
        cacheCreate1hTokens,
        correlationId,
        isSidechain,
        source: 'assistant',
      });
    } catch {
      // NFR-9 NEVER-throw — drop the row, continue. Phase 4 will wire
      // `logHookEvent({kind:'analyze_internal_error'})` once the kind is
      // added to error-logger.ts EventKind union (currently coerces to
      // 'unknown' which would pollute counts).
      continue;
    }
  }

  return rows;
}

/**
 * parseCorrelationId — split OB-2 3-segment correlationId.
 *
 * Format (FR-4 / OB-2 Q5 lock): `<sid>:<task>:<iter>` — all three segments
 * non-empty when present. Anything else (undefined, empty string, fewer or
 * more colons, empty middle segment) → all undefined so the caller routes
 * the row into the `unknown` bucket without a partial match (Decision 11
 * — partial buckets risk double-attribution across spec/phase/task levels).
 *
 * Pure helper, NEVER-throw — used by aggregateBy.
 */
function parseCorrelationId(cid?: string): {
  sid?: string;
  task?: string;
  iter?: string;
} {
  if (typeof cid !== 'string' || cid.length === 0) return {};
  const parts = cid.split(':');
  if (parts.length !== 3) return {};
  const [sid, task, iter] = parts;
  if (!sid || !task || !iter) return {};
  return { sid, task, iter };
}

/**
 * aggregateBy — three-level join: rows → AggregateBucket[] keyed by
 * spec | phase | task (FR-AGG-1 / FR-AGG-2 / FR-AGG-3 / AC4).
 *
 * Bucket key derivation (design §Components #2 三级聚合策略):
 *   • level='spec'  → key = parsed.sid                   (fallback 'unknown')
 *   • level='phase' → key = ctx.specPhaseMap[sid]        (fallback 'unknown')
 *   • level='task'  → key = full correlationId string    (fallback 'unknown')
 *
 * Per-bucket accumulation:
 *   • totalUSD     — sum of computeCost(row), 4-decimal rounded at the boundary
 *   • rowCount     — total rows in bucket (parent assistant + subagent_trailer)
 *   • trailerCount — rows where source === 'subagent_trailer' only (FR-AGG-3
 *                    trailer hit-rate signal)
 *   • durationMs   — sum of row.durationMs ?? 0 (trailer carries durationMs;
 *                    parent assistant_turn typically does not)
 *   • modelMix     — per-model { tokens: input+output, usd: computeCost }
 *                    (cache_* tokens excluded from mix tokens to keep R6
 *                    tokenizer cohort breakdown comparable across models —
 *                    cache writes/reads are billing artifacts not generation)
 *   • inputTokens / outputTokens / cacheReadTokens / cacheCreate5m/1hTokens
 *                    — straight per-row sums for downstream R4/R5 (cache hit
 *                    rate, churn ratio) and R6 (cohort tokens).
 *
 * Decision 11 (double-billing guard): same requestId can carry both
 * source='assistant' (parent) and source='subagent_trailer' (child) — we do
 * NOT dedupe by requestId here. filter.ts dedupes parent rows upstream;
 * trailer rows pass through untouched and get bucketed separately by
 * `source` discriminator. Both contribute independently to totalUSD.
 *
 * Output sort: descending totalUSD so R7_topN buckets[0..top-1] is the
 * cost-leader cut without re-sorting at the render layer.
 *
 * NEVER-throw (NFR-9): full body wrapped — malformed input returns [].
 */
export function aggregateBy(
  rows: UsageRow[],
  level: 'spec' | 'phase' | 'task',
  ctx?: { specPhaseMap?: Record<string, string> },
): AggregateBucket[] {
  try {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const specPhaseMap = ctx?.specPhaseMap ?? {};
    const buckets = new Map<string, AggregateBucket>();

    for (const row of rows) {
      if (!row) continue;
      const parsed = parseCorrelationId(row.correlationId);

      let key: string;
      let specHint: string | undefined;
      let phaseHint: string | undefined;
      if (level === 'spec') {
        key = parsed.sid ?? 'unknown';
        specHint = parsed.sid;
      } else if (level === 'phase') {
        key = (parsed.sid && specPhaseMap[parsed.sid]) ?? 'unknown';
        specHint = parsed.sid;
        phaseHint = parsed.sid ? specPhaseMap[parsed.sid] : undefined;
      } else {
        // task
        key = row.correlationId ?? 'unknown';
        specHint = parsed.sid;
        phaseHint = parsed.sid ? specPhaseMap[parsed.sid] : undefined;
      }

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          level,
          key,
          totalUSD: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreate5mTokens: 0,
          cacheCreate1hTokens: 0,
          rowCount: 0,
          trailerCount: 0,
          durationMs: 0,
          modelMix: {},
          spec: specHint,
          phase: phaseHint,
        };
        buckets.set(key, bucket);
      }

      const usd = computeCost(row);
      bucket.totalUSD += usd;
      bucket.inputTokens += row.inputTokens ?? 0;
      bucket.outputTokens += row.outputTokens ?? 0;
      bucket.cacheReadTokens += row.cacheReadTokens ?? 0;
      bucket.cacheCreate5mTokens += row.cacheCreate5mTokens ?? 0;
      bucket.cacheCreate1hTokens += row.cacheCreate1hTokens ?? 0;
      bucket.rowCount += 1;
      if (row.source === 'subagent_trailer') bucket.trailerCount += 1;
      bucket.durationMs += row.durationMs ?? 0;

      const modelKey = row.model || 'unknown';
      const mix = bucket.modelMix[modelKey] ?? { tokens: 0, usd: 0 };
      mix.tokens += (row.inputTokens ?? 0) + (row.outputTokens ?? 0);
      mix.usd += usd;
      bucket.modelMix[modelKey] = mix;
    }

    // Re-round totalUSD at the boundary (Decision 10 — accumulate raw,
    // round on emit). Per-row computeCost is already 4-decimal rounded so
    // the sum drift is bounded by N × 0.00005; rounding once here keeps the
    // bucket-level value exactly representable for the JSON consumer.
    const out = Array.from(buckets.values()).map((b) => ({
      ...b,
      totalUSD: Math.round(b.totalUSD * 10000) / 10000,
    }));
    out.sort((a, b) => b.totalUSD - a.totalUSD);
    return out;
  } catch {
    // NFR-9 NEVER-throw — malformed input drops to empty array.
    return [];
  }
}

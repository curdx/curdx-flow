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
import type { Event, EventLogRow, UsageRow } from './types.js';

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
      if (!ev || ev.kind !== 'assistant_turn') continue;

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

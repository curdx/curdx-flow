// Unit tests for src/analyze/cost.ts#computeCost (Phase 3 Task 3.2)
// + src/analyze/cost.ts#extractTrailerUsage (Phase 3 Task 3.4).
//
// Coverage (FR-COST-1 / FR-COST-2 / NFR-1 / AC3 / FR-PARSER-4 / FR-AGG-2):
//   1. Opus 4.7   — input=1M output=1M           → $5  + $25 = $30
//   2. Sonnet 4.6 — input=1M output=1M           → $3  + $15 = $18
//   3. Haiku 4.5  — input=1M output=1M           → $1  + $5  = $6
//   4. Opus 4.7   — cache_read=1M                → $0.5  (5 × 0.1)
//   5. Opus 4.7   — cache_5m_write=1M            → $6.25 (5 × 1.25)
//   6. Opus 4.7   — cache_1h_write=1M            → $10   (5 × 2.0)
//   7. Unknown model row                          → 0 (NEVER-throw, FR-PARSER-3)
//   8-12. extractTrailerUsage regex coverage (design §Components #2):
//     8.  single trailer → 1 row
//     9.  5 trailers in one text → 5 rows (global flag exec loop)
//     10. zero trailers → []
//     11. literal `\n` newlines + JSON-escape `\\n` newlines both match
//     12. malformed trailer (no closing tag) → [] (NEVER-throw, NFR-9)
//
// Each computeCost assertion uses `toBeCloseTo(expected, 3)` for ±0.001 USD
// precision per AC3. 1M-token amounts keep arithmetic clean (per-MTok price
// = USD).

import { describe, it, expect } from 'vitest';

import { aggregateBy, computeCost, extractTrailerUsage } from '../../src/analyze/cost.ts';
import type { UsageRow } from '../../src/analyze/types.ts';

function row(overrides: Partial<UsageRow>): UsageRow {
  return {
    ts: '2026-05-07T00:00:00.000Z',
    requestId: 'req_test',
    model: 'claude-opus-4-7',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreate5mTokens: 0,
    cacheCreate1hTokens: 0,
    source: 'assistant',
    ...overrides,
  };
}

describe('computeCost', () => {
  it('Opus 4.7 — input=1M + output=1M → $30 (±0.001)', () => {
    const usd = computeCost(
      row({ model: 'claude-opus-4-7', inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    );
    expect(usd).toBeCloseTo(30, 3);
  });

  it('Sonnet 4.6 — input=1M + output=1M → $18 (±0.001)', () => {
    const usd = computeCost(
      row({ model: 'claude-sonnet-4-6', inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    );
    expect(usd).toBeCloseTo(18, 3);
  });

  it('Haiku 4.5 — input=1M + output=1M → $6 (±0.001)', () => {
    const usd = computeCost(
      row({
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    );
    expect(usd).toBeCloseTo(6, 3);
  });

  it('Opus 4.7 — cache_read=1M → $0.5 (5 × 0.1, ±0.001)', () => {
    const usd = computeCost(
      row({ model: 'claude-opus-4-7', cacheReadTokens: 1_000_000 }),
    );
    expect(usd).toBeCloseTo(0.5, 3);
  });

  it('Opus 4.7 — cache_5m_write=1M → $6.25 (5 × 1.25, ±0.001)', () => {
    const usd = computeCost(
      row({ model: 'claude-opus-4-7', cacheCreate5mTokens: 1_000_000 }),
    );
    expect(usd).toBeCloseTo(6.25, 3);
  });

  it('Opus 4.7 — cache_1h_write=1M → $10 (5 × 2.0, ±0.001)', () => {
    const usd = computeCost(
      row({ model: 'claude-opus-4-7', cacheCreate1hTokens: 1_000_000 }),
    );
    expect(usd).toBeCloseTo(10, 3);
  });

  it('unknown model → returns 0 without throwing (FR-PARSER-3 / NFR-9)', () => {
    const usd = computeCost(
      row({
        model: 'claude-fictional-99-9-20991231',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    );
    expect(usd).toBe(0);
  });
});

// extractTrailerUsage — sidechain `<usage>...</usage>` regex extraction
// (FR-PARSER-4 / FR-AGG-2 / design §Components #2).
//
// Parent context shared across all cases — Decision 11/12 require trailer
// rows to inherit ts/requestId/correlationId from the parent assistant turn
// so aggregateBy task-level joins still group child trailer rows under the
// parent task bucket.
const PARENT = {
  ts: '2026-05-07T00:00:00Z',
  requestId: 'req-test-1',
  correlationId: 'sid:1.2:1',
} as const;

describe('extractTrailerUsage', () => {
  it('single trailer hit → 1 row with parent ts/requestId/correlationId inherited', () => {
    const text =
      'sidechain assistant turn output\n<usage>total_tokens: 8200\ntool_uses: 14\nduration_ms: 9450</usage>\nepilogue';
    const rows = extractTrailerUsage(text, PARENT);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r).toBeDefined();
    if (!r) throw new Error('row[0] missing');
    expect(r.ts).toBe(PARENT.ts);
    expect(r.requestId).toBe(PARENT.requestId);
    expect(r.correlationId).toBe(PARENT.correlationId);
    expect(r.outputTokens).toBe(8200);
    expect(r.durationMs).toBe(9450);
    expect(r.source).toBe('subagent_trailer');
    expect(r.model).toBe('unknown');
  });

  it('5 trailers in one text → 5 rows (global flag exec loop, FR-AGG-2)', () => {
    const segs: string[] = [];
    for (let i = 0; i < 5; i++) {
      segs.push(
        `<usage>total_tokens: ${100 + i}\ntool_uses: ${i + 1}\nduration_ms: ${1000 + i * 10}</usage>`,
      );
    }
    const text = segs.join('\nfiller text between\n');
    const rows = extractTrailerUsage(text, PARENT);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.outputTokens)).toEqual([100, 101, 102, 103, 104]);
    expect(rows.map((r) => r.durationMs)).toEqual([1000, 1010, 1020, 1030, 1040]);
    // All 5 rows share parent correlationId — aggregateBy task bucket joins
    // them with the parent assistant turn under one task key.
    for (const r of rows) {
      expect(r.correlationId).toBe(PARENT.correlationId);
      expect(r.source).toBe('subagent_trailer');
    }
  });

  it('zero trailers in text → [] (no false positives)', () => {
    const text = 'plain assistant text with no trailer at all\njust prose.';
    const rows = extractTrailerUsage(text, PARENT);
    expect(rows).toEqual([]);
  });

  it('matches both literal `\\n` and JSON-escape `\\\\n` newline forms (FR-PARSER-4)', () => {
    // Form A: real newline characters (post JSON.parse), the typical in-memory
    // shape after readline + JSON.parse drops the transcript line into events.
    const realNewlines =
      '<usage>total_tokens: 5000\ntool_uses: 3\nduration_ms: 2000</usage>';
    // Form B: literal backslash-n characters as they would appear pre-parse
    // (e.g. raw fixture bytes inspected via grep). The transcript fixture
    // sample-with-usage.jsonl stores the trailer in this escaped form because
    // the surrounding JSON string encodes the newline.
    const literalBackslashN =
      '<usage>total_tokens: 7777\\ntool_uses: 9\\nduration_ms: 3500</usage>';
    const rowsA = extractTrailerUsage(realNewlines, PARENT);
    const rowsB = extractTrailerUsage(literalBackslashN, PARENT);
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0]?.outputTokens).toBe(5000);
    expect(rowsA[0]?.durationMs).toBe(2000);
    expect(rowsB[0]?.outputTokens).toBe(7777);
    expect(rowsB[0]?.durationMs).toBe(3500);
  });

  it('malformed trailer (no closing tag) → [] without throwing (NFR-9 NEVER-throw)', () => {
    const broken = '<usage>total_tokens: 100\ntool_uses: 5\nduration_ms: 999';
    expect(() => extractTrailerUsage(broken, PARENT)).not.toThrow();
    const rows = extractTrailerUsage(broken, PARENT);
    expect(rows).toEqual([]);
  });
});

// aggregateBy — 3-level (spec | phase | task) bucket join over UsageRow[]
// (FR-AGG-1 / FR-AGG-2 / FR-AGG-3 / Decision 11 / AC4).
//
// Fixture rationale — 10 rows covering the 3 dimensional axes the
// aggregation contract has to defend against simultaneously:
//   • spec axis     — 2 spec ids (sid1, sid2) + 1 unknown (no correlationId)
//   • phase axis    — sid1→'design', sid2→'requirements', unknown→'unknown'
//   • task axis     — 4 distinct correlationIds (sid1:1.1:1, sid1:1.2:1,
//                     sid2:2.1:1) + the missing-id 'unknown' bucket
//   • source axis   — assistant + subagent_trailer pairs sharing requestId
//                     to lock Decision 11 (no requestId-dedup; trailer rows
//                     bucket alongside parent and BOTH contribute to USD).
//   • model axis    — Opus 4.7 / Sonnet 4.6 / Haiku 4.5 across rows so
//                     modelMix accumulation is exercised per bucket.
//
// All assertions cite `toBeCloseTo(usd, 3)` for ±0.001 USD precision per AC3
// when checking summed totals, exact integers for token / count fields.

const SPEC_PHASE_MAP: Record<string, string> = {
  sid1: 'design',
  sid2: 'requirements',
};

// Per-row USD reference (computed against pricing.ts numbers, MTok scale):
//   Opus 4.7   1MTok in + 1MTok out = $5  + $25 = $30
//   Opus 4.7   1MTok in              = $5
//   Sonnet 4.6 1MTok in + 1MTok out = $3  + $15 = $18
//   Haiku 4.5  1MTok in + 1MTok out = $1  + $5  = $6
//   trailer    1MTok out (model='unknown' → cost=0; trailer rows are
//              bucket-counted but contribute $0 to totalUSD per Decision 12
//              + cost.ts `extractTrailerUsage` setting model='unknown')
const FIXTURE_ROWS: UsageRow[] = [
  // sid1 / task 1.1 — assistant (Opus 4.7) + trailer same requestId
  {
    ts: '2026-05-07T00:00:00Z',
    requestId: 'req-1',
    model: 'claude-opus-4-7',
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheCreate5mTokens: 0,
    cacheCreate1hTokens: 0,
    correlationId: 'sid1:1.1:1',
    source: 'assistant',
  },
  {
    ts: '2026-05-07T00:00:01Z',
    requestId: 'req-1', // same requestId as above — Decision 11 no-dedup
    model: 'unknown',
    inputTokens: 0,
    outputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheCreate5mTokens: 0,
    cacheCreate1hTokens: 0,
    correlationId: 'sid1:1.1:1',
    source: 'subagent_trailer',
    durationMs: 9450,
  },
  // sid1 / task 1.2 — assistant (Sonnet 4.6) + trailer same requestId
  {
    ts: '2026-05-07T00:01:00Z',
    requestId: 'req-2',
    model: 'claude-sonnet-4-6',
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheCreate5mTokens: 0,
    cacheCreate1hTokens: 0,
    correlationId: 'sid1:1.2:1',
    source: 'assistant',
  },
  {
    ts: '2026-05-07T00:01:01Z',
    requestId: 'req-2',
    model: 'unknown',
    inputTokens: 0,
    outputTokens: 500_000,
    cacheReadTokens: 0,
    cacheCreate5mTokens: 0,
    cacheCreate1hTokens: 0,
    correlationId: 'sid1:1.2:1',
    source: 'subagent_trailer',
    durationMs: 4200,
  },
  // sid1 / task 1.2 — second assistant (Haiku 4.5) under same task
  {
    ts: '2026-05-07T00:01:02Z',
    requestId: 'req-3',
    model: 'claude-haiku-4-5-20251001',
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheCreate5mTokens: 0,
    cacheCreate1hTokens: 0,
    correlationId: 'sid1:1.2:1',
    source: 'assistant',
  },
  // sid2 / task 2.1 — assistant (Opus 4.7) input-only
  {
    ts: '2026-05-07T00:02:00Z',
    requestId: 'req-4',
    model: 'claude-opus-4-7',
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreate5mTokens: 0,
    cacheCreate1hTokens: 0,
    correlationId: 'sid2:2.1:1',
    source: 'assistant',
  },
  // sid2 / task 2.1 — assistant (Sonnet 4.6) full
  {
    ts: '2026-05-07T00:02:01Z',
    requestId: 'req-5',
    model: 'claude-sonnet-4-6',
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheCreate5mTokens: 0,
    cacheCreate1hTokens: 0,
    correlationId: 'sid2:2.1:1',
    source: 'assistant',
  },
  // sid2 / task 2.1 — trailer (different requestId)
  {
    ts: '2026-05-07T00:02:02Z',
    requestId: 'req-6',
    model: 'unknown',
    inputTokens: 0,
    outputTokens: 200_000,
    cacheReadTokens: 0,
    cacheCreate5mTokens: 0,
    cacheCreate1hTokens: 0,
    correlationId: 'sid2:2.1:1',
    source: 'subagent_trailer',
    durationMs: 1500,
  },
  // unknown bucket — no correlationId at all
  {
    ts: '2026-05-07T00:03:00Z',
    requestId: 'req-7',
    model: 'claude-haiku-4-5-20251001',
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheCreate5mTokens: 0,
    cacheCreate1hTokens: 0,
    source: 'assistant',
  },
  // unknown bucket — malformed correlationId (only 2 segments)
  {
    ts: '2026-05-07T00:03:01Z',
    requestId: 'req-8',
    model: 'claude-opus-4-7',
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreate5mTokens: 0,
    cacheCreate1hTokens: 0,
    correlationId: 'malformed:id',
    source: 'assistant',
  },
];

describe('aggregateBy', () => {
  it("level='spec' — 2 sid buckets + 1 unknown bucket; trailerCount + modelMix per spec (FR-AGG-1 / Decision 11)", () => {
    const buckets = aggregateBy(FIXTURE_ROWS, 'spec', { specPhaseMap: SPEC_PHASE_MAP });
    // 3 buckets total: sid1 / sid2 / unknown
    expect(buckets).toHaveLength(3);
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));

    const sid1 = byKey['sid1'];
    const sid2 = byKey['sid2'];
    const unk = byKey['unknown'];
    if (!sid1 || !sid2 || !unk) throw new Error('missing expected spec bucket');

    // sid1 holds 5 rows (2 task-1.1 + 3 task-1.2), 2 trailers
    expect(sid1.rowCount).toBe(5);
    expect(sid1.trailerCount).toBe(2);
    // totalUSD: Opus full ($30) + Sonnet full ($18) + Haiku full ($6) + 2 trailers ($0)
    expect(sid1.totalUSD).toBeCloseTo(54, 3);
    // modelMix: 3 model entries — Opus / Sonnet / Haiku / unknown trailer
    expect(sid1.modelMix['claude-opus-4-7']).toEqual({ tokens: 2_000_000, usd: 30 });
    expect(sid1.modelMix['claude-sonnet-4-6']).toEqual({ tokens: 2_000_000, usd: 18 });
    expect(sid1.modelMix['claude-haiku-4-5-20251001']).toEqual({ tokens: 2_000_000, usd: 6 });
    // trailer rows roll under model='unknown' with usd=0; tokens summed from output
    expect(sid1.modelMix['unknown']).toEqual({ tokens: 1_500_000, usd: 0 });
    // duration only carried by trailer rows; parent rows have undefined → 0 contribution
    expect(sid1.durationMs).toBe(9450 + 4200);

    // sid2 holds 3 rows (2 assistant + 1 trailer)
    expect(sid2.rowCount).toBe(3);
    expect(sid2.trailerCount).toBe(1);
    // totalUSD: Opus input-only ($5) + Sonnet full ($18) + 1 trailer ($0)
    expect(sid2.totalUSD).toBeCloseTo(23, 3);
    expect(sid2.modelMix['claude-opus-4-7']).toEqual({ tokens: 1_000_000, usd: 5 });
    expect(sid2.modelMix['claude-sonnet-4-6']).toEqual({ tokens: 2_000_000, usd: 18 });
    expect(sid2.modelMix['unknown']).toEqual({ tokens: 200_000, usd: 0 });
    expect(sid2.durationMs).toBe(1500);

    // unknown bucket: missing correlationId row + malformed (2-seg) row
    expect(unk.rowCount).toBe(2);
    expect(unk.trailerCount).toBe(0);
    // Haiku full ($6) + Opus input-only ($5)
    expect(unk.totalUSD).toBeCloseTo(11, 3);

    // Sum across all buckets equals total fixture row count (no row drops, AC4)
    const sumRows = buckets.reduce((acc, b) => acc + b.rowCount, 0);
    expect(sumRows).toBe(FIXTURE_ROWS.length);
  });

  it("level='phase' — sid→phase via specPhaseMap; missing sid → 'unknown' bucket (FR-AGG-2 / NFR-9)", () => {
    const buckets = aggregateBy(FIXTURE_ROWS, 'phase', { specPhaseMap: SPEC_PHASE_MAP });
    // 3 buckets: design (sid1) / requirements (sid2) / unknown (no sid + malformed)
    expect(buckets).toHaveLength(3);
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));

    const design = byKey['design'];
    const reqs = byKey['requirements'];
    const unk = byKey['unknown'];
    if (!design || !reqs || !unk) throw new Error('missing expected phase bucket');

    // design = sid1 rollup
    expect(design.rowCount).toBe(5);
    expect(design.trailerCount).toBe(2);
    expect(design.totalUSD).toBeCloseTo(54, 3);

    // requirements = sid2 rollup
    expect(reqs.rowCount).toBe(3);
    expect(reqs.trailerCount).toBe(1);
    expect(reqs.totalUSD).toBeCloseTo(23, 3);

    // unknown bucket: missing-correlationId row + malformed-2seg row both fall here
    expect(unk.rowCount).toBe(2);
    expect(unk.trailerCount).toBe(0);
    expect(unk.totalUSD).toBeCloseTo(11, 3);

    // Sum row preservation across all buckets (AC4)
    expect(buckets.reduce((acc, b) => acc + b.rowCount, 0)).toBe(FIXTURE_ROWS.length);
  });

  it("level='task' — full correlationId keys; same requestId NOT deduped (Decision 11 / AC4)", () => {
    const buckets = aggregateBy(FIXTURE_ROWS, 'task', { specPhaseMap: SPEC_PHASE_MAP });
    // 5 task keys at task level: sid1:1.1:1 / sid1:1.2:1 / sid2:2.1:1 +
    // raw 'malformed:id' (parseCorrelationId rejects it for sid/phase paths
    // but task level keys on `row.correlationId ?? 'unknown'` — so the raw
    // string survives as its own bucket) + 'unknown' (the row with no cid).
    expect(buckets).toHaveLength(5);
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));

    const t11 = byKey['sid1:1.1:1'];
    const t12 = byKey['sid1:1.2:1'];
    const t21 = byKey['sid2:2.1:1'];
    const malformed = byKey['malformed:id'];
    const unk = byKey['unknown'];
    if (!t11 || !t12 || !t21 || !malformed || !unk) {
      throw new Error('missing expected task bucket');
    }

    // sid1:1.1:1 — Decision 11 lock: parent (req-1, assistant) + trailer
    // (req-1, subagent_trailer) BOTH bucketed despite shared requestId.
    expect(t11.rowCount).toBe(2);
    expect(t11.trailerCount).toBe(1);
    expect(t11.totalUSD).toBeCloseTo(30, 3); // $30 Opus + $0 trailer
    // both rows survive the bucket (no requestId-dedup at aggregateBy layer)
    expect(t11.modelMix['claude-opus-4-7']).toEqual({ tokens: 2_000_000, usd: 30 });
    expect(t11.modelMix['unknown']).toEqual({ tokens: 1_000_000, usd: 0 });
    expect(t11.durationMs).toBe(9450);

    // sid1:1.2:1 — also a parent+trailer requestId pair (req-2) AND a third
    // independent assistant row (req-3 Haiku); proves trailer dedup is NOT
    // requestId-based AND multi-assistant-rows-per-task accumulate cleanly.
    expect(t12.rowCount).toBe(3);
    expect(t12.trailerCount).toBe(1);
    expect(t12.totalUSD).toBeCloseTo(18 + 6, 3); // Sonnet full + Haiku full + $0 trailer
    expect(t12.modelMix['claude-sonnet-4-6']).toEqual({ tokens: 2_000_000, usd: 18 });
    expect(t12.modelMix['claude-haiku-4-5-20251001']).toEqual({ tokens: 2_000_000, usd: 6 });
    expect(t12.modelMix['unknown']).toEqual({ tokens: 500_000, usd: 0 });
    expect(t12.durationMs).toBe(4200);

    // sid2:2.1:1 — 3 distinct requestIds (req-4, req-5, req-6 trailer)
    expect(t21.rowCount).toBe(3);
    expect(t21.trailerCount).toBe(1);
    expect(t21.totalUSD).toBeCloseTo(5 + 18, 3); // Opus input-only + Sonnet full + $0 trailer
    expect(t21.durationMs).toBe(1500);

    // unknown bucket holds the row with missing correlationId (Haiku full)
    expect(unk.rowCount).toBe(1);
    expect(unk.trailerCount).toBe(0);
    expect(unk.totalUSD).toBeCloseTo(6, 3);

    // malformed:id bucket — task-level keys on raw correlationId so a
    // 2-segment string surfaces as its own (degenerate) bucket. spec/phase
    // levels still bin it into 'unknown' since parseCorrelationId rejects
    // it; the divergence between levels is intentional (Decision 11 — task
    // level is the most granular and faithfully echoes the raw id).
    expect(malformed.rowCount).toBe(1);
    expect(malformed.trailerCount).toBe(0);
    expect(malformed.totalUSD).toBeCloseTo(5, 3);

    // Buckets pre-sorted desc by totalUSD (R7_topN slice contract)
    for (let i = 0; i < buckets.length - 1; i++) {
      const cur = buckets[i];
      const next = buckets[i + 1];
      if (!cur || !next) throw new Error('bucket pair missing');
      expect(cur.totalUSD).toBeGreaterThanOrEqual(next.totalUSD);
    }

    // Row preservation across all task buckets (AC4)
    expect(buckets.reduce((acc, b) => acc + b.rowCount, 0)).toBe(FIXTURE_ROWS.length);
  });
});

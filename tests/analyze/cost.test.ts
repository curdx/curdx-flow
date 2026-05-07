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

import { computeCost, extractTrailerUsage } from '../../src/analyze/cost.ts';
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

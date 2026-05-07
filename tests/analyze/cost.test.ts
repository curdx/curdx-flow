// Unit tests for src/analyze/cost.ts#computeCost (Phase 3 Task 3.2).
//
// Coverage (FR-COST-1 / FR-COST-2 / NFR-1 / AC3):
//   1. Opus 4.7   — input=1M output=1M           → $5  + $25 = $30
//   2. Sonnet 4.6 — input=1M output=1M           → $3  + $15 = $18
//   3. Haiku 4.5  — input=1M output=1M           → $1  + $5  = $6
//   4. Opus 4.7   — cache_read=1M                → $0.5  (5 × 0.1)
//   5. Opus 4.7   — cache_5m_write=1M            → $6.25 (5 × 1.25)
//   6. Opus 4.7   — cache_1h_write=1M            → $10   (5 × 2.0)
//   7. Unknown model row                          → 0 (NEVER-throw, FR-PARSER-3)
//
// Each assertion uses `toBeCloseTo(expected, 3)` for ±0.001 USD precision
// per AC3. 1M-token amounts keep arithmetic clean (per-MTok price = USD).

import { describe, it, expect } from 'vitest';

import { computeCost } from '../../src/analyze/cost.ts';
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

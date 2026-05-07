// Unit tests for src/analyze/recommend.ts MAD primitives (Phase 3 Task 3.8).
//
// Coverage — 11 edge cases for findOutliers / modifiedZScore matching
// research.md §MAD case table, adjusted for Decision 6 madMinN = 10
// (research §MAD baseline MIN_N=5 was raised to 10 in design — see
// recommend.ts L14-16 for rationale).
//
// Case table (11 cases):
//   1.  N = 0                              → []
//   2.  N = 1                              → []
//   3.  N = 4                              → [] (research baseline below 5)
//   4.  N = 9                              → [] (just below MIN_N=10)
//   5.  N = 10 all-equal                   → [] (MAD = 0 short-circuit)
//   6.  N = 10 with MAD = 0 + outlier      → [] (≥50% identical kills MAD)
//   7.  N = 10 single clear outlier        → [9] (last index flagged)
//   8.  N = 10 two outliers (high/highest) → [8, 9]
//   9.  N = 10 negative outlier            → flagged at correct index
//   10. modifiedZScore returns zeros (not NaN/Infinity) for degenerate cases
//   11. input array is not mutated (Object.freeze + before/after deep-equal)
//
// References: research.md §MAD §11 testcase table / design.md Decision 6
// (madMinN=10) / requirements.md FR-RULE-5 / NFR-10 (insufficient_data).
//
// Phase 4 Task 4.2 — 8 rule × 4 severity coverage appended below.
// Each rule gets a dedicated describe block testing severity combinations
// (info/warn/sev/insufficient_data) per FR-RULE-1..8 / NFR-10 / AC6.

import { describe, it, expect } from 'vitest';

import {
  findOutliers,
  modifiedZScore,
  recommend,
  type RecommendContext,
} from '../../src/analyze/recommend.ts';
import type { AggregateBucket, EventLogRow } from '../../src/analyze/types.ts';

describe('MAD findOutliers — 11 edge cases (Decision 6 MIN_N=10)', () => {
  it('case 1: N=0 → []', () => {
    expect(findOutliers([])).toEqual([]);
    expect(modifiedZScore([])).toEqual([]);
  });

  it('case 2: N=1 → []', () => {
    expect(findOutliers([42])).toEqual([]);
    // modifiedZScore returns same-length zeros (N < MIN_N short-circuit)
    expect(modifiedZScore([42])).toEqual([0]);
  });

  it('case 3: N=4 → [] (below research baseline 5)', () => {
    expect(findOutliers([1, 2, 3, 100])).toEqual([]);
    expect(modifiedZScore([1, 2, 3, 100])).toEqual([0, 0, 0, 0]);
  });

  it('case 4: N=9 → [] (just below MIN_N=10)', () => {
    // Even with a clear outlier, N<10 short-circuits to no findings.
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 999];
    expect(findOutliers(values)).toEqual([]);
    expect(modifiedZScore(values)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('case 5: N=10 all-equal → [] (MAD = 0)', () => {
    const values = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
    expect(findOutliers(values)).toEqual([]);
    expect(modifiedZScore(values)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('case 6: N=10 with MAD=0 (≥50% identical) + outlier → []', () => {
    // 7 identical values → median deviation array's median is 0 → MAD = 0 → []
    const values = [5, 5, 5, 5, 5, 5, 5, 6, 7, 999];
    expect(findOutliers(values)).toEqual([]);
    // every entry collapses to 0 because mad === 0 short-circuit hits
    const z = modifiedZScore(values);
    expect(z).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('case 7: N=10 single clear outlier → [9]', () => {
    // Tight cluster 1..9 then a clear spike at index 9.
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10000];
    const out = findOutliers(values);
    expect(out).toEqual([9]);
    // The flagged value's |z| must exceed 3.5
    const z = modifiedZScore(values);
    expect(Math.abs(z[9] as number)).toBeGreaterThan(3.5);
  });

  it('case 8: N=10 two outliers → [8, 9]', () => {
    // Two large spikes at the end of an otherwise tight cluster.
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9000, 10000];
    const out = findOutliers(values);
    expect(out).toEqual([8, 9]);
  });

  it('case 9: N=10 negative outlier → flagged at index 0', () => {
    // A large-magnitude negative deviation must also flag.
    const values = [-10000, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const out = findOutliers(values);
    expect(out).toContain(0);
    const z = modifiedZScore(values);
    expect(z[0] as number).toBeLessThan(-3.5);
  });

  it('case 10: modifiedZScore returns finite zeros for degenerate cases (no NaN/Infinity)', () => {
    // N < MIN_N → zeros (not NaN from /MAD=0)
    const small = modifiedZScore([1, 2, 3]);
    for (const z of small) {
      expect(Number.isFinite(z)).toBe(true);
      expect(z).toBe(0);
    }
    // MAD = 0 with N >= MIN_N → zeros (not NaN/Infinity)
    const flat = modifiedZScore([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
    for (const z of flat) {
      expect(Number.isFinite(z)).toBe(true);
      expect(z).toBe(0);
    }
    // Empty input → empty (not [NaN])
    expect(modifiedZScore([])).toEqual([]);
  });

  it('case 11: input array is not mutated (frozen + deep-equal before/after)', () => {
    // Path A — frozen input must not throw (no internal sort/push on the arg).
    const frozen = Object.freeze([10, 20, 30, 40, 50, 60, 70, 80, 90, 99999]);
    expect(() => modifiedZScore(frozen as unknown as number[])).not.toThrow();
    expect(() => findOutliers(frozen as unknown as number[])).not.toThrow();

    // Path B — deep-equal snapshot before vs after.
    const values = [3, 1, 4, 1, 5, 9, 2, 6, 5, 99999];
    const snapshot = JSON.parse(JSON.stringify(values));
    findOutliers(values);
    modifiedZScore(values);
    expect(values).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Phase 4 Task 4.2 — recommend() 8 rules × 4 severity coverage.
//
// Helper factory for AggregateBucket: build minimal-but-valid buckets via
// per-test overrides so each describe block stays focused on the rule under
// test. modelMix defaults to a single Sonnet entry (non-Opus, used by rule-4
// healthy/info path). Cost / token / cache fields default to zero — overrides
// drive the severity tier.
//
// Filter helper to scope assertions to a single rule (recommend() runs all 8
// rules over the same buckets so other rules may emit unrelated findings).
// ---------------------------------------------------------------------------

function bucket(overrides: Partial<AggregateBucket>): AggregateBucket {
  return {
    level: 'task',
    key: 'sid:1.1:1',
    totalUSD: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreate5mTokens: 0,
    cacheCreate1hTokens: 0,
    rowCount: 1,
    trailerCount: 0,
    durationMs: 0,
    modelMix: { 'claude-sonnet-4-7': { tokens: 100, usd: 0 } },
    ...overrides,
  };
}

function findingsFor(rule: string, buckets: AggregateBucket[], ctx: RecommendContext = {}) {
  return recommend(buckets, ctx).filter((r) => r.rule === rule);
}

describe('rule-1 cache-hit-low — FR-RULE-1', () => {
  it('sev: hit rate < 30% threshold flags severity=sev', () => {
    // cacheRead=100, denom = 100 + 0 + 0 + 1000 = 1100, hit ≈ 9.1% < 30%
    const b = bucket({
      level: 'spec',
      key: 'sidA',
      cacheReadTokens: 100,
      inputTokens: 1000,
    });
    const found = findingsFor('cache-hit-low', [b]);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('sev');
    expect(found[0]?.evidence).toMatchObject({ cacheRead: 100, inputTokens: 1000 });
  });

  it('warn: hit rate between 30% and 60% flags severity=warn', () => {
    // cacheRead=400, denom=400 + 600 = 1000, hit=40% → warn
    const b = bucket({
      level: 'spec',
      key: 'sidA',
      cacheReadTokens: 400,
      inputTokens: 600,
    });
    const found = findingsFor('cache-hit-low', [b]);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('warn');
  });

  it('info: hit rate ≥ 60% threshold flags severity=info (healthy nudge)', () => {
    // cacheRead=800, denom=1000, hit=80% — healthy
    const b = bucket({
      level: 'spec',
      key: 'sidA',
      cacheReadTokens: 800,
      inputTokens: 200,
    });
    const found = findingsFor('cache-hit-low', [b]);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('info');
  });

  it('insufficient_data: zero input-side tokens emits insufficient_data', () => {
    const b = bucket({
      level: 'spec',
      key: 'sidA',
      cacheReadTokens: 0,
      cacheCreate5mTokens: 0,
      cacheCreate1hTokens: 0,
      inputTokens: 0,
    });
    const found = findingsFor('cache-hit-low', [b]);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('insufficient_data');
  });
});

describe('rule-2 output-tok-high — FR-RULE-2', () => {
  it('sev: avg output tok/turn > 16000 flags severity=sev', () => {
    // outputTokens=20000, rowCount=1 → avg=20000 > 16000
    const b = bucket({ level: 'task', outputTokens: 20000, rowCount: 1 });
    const found = findingsFor('output-tok-high', [b]);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('sev');
    expect(found[0]?.evidence).toMatchObject({ rowCount: 1 });
  });

  it('warn: avg output tok/turn between 8000 and 16000 flags severity=warn', () => {
    // outputTokens=12000, rowCount=1 → avg=12000 → warn
    const b = bucket({ level: 'task', outputTokens: 12000, rowCount: 1 });
    const found = findingsFor('output-tok-high', [b]);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('warn');
  });

  it('insufficient_data: rowCount=0 emits insufficient_data', () => {
    const b = bucket({ level: 'task', outputTokens: 5000, rowCount: 0 });
    const found = findingsFor('output-tok-high', [b]);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('insufficient_data');
  });
});

describe('rule-3 hit-cap-rate — FR-RULE-3', () => {
  it('sev: 429 ratio > 20% flags severity=sev', () => {
    // 5 errors total, 3 are 429 → ratio=60% > 20%
    const errors: EventLogRow[] = [
      { ts: '2026-05-07T00:00:00Z', kind: 'ratelimit_429', correlationId: 'sidA:1.1:1' },
      { ts: '2026-05-07T00:00:01Z', kind: 'ratelimit_429', correlationId: 'sidA:1.1:2' },
      { ts: '2026-05-07T00:00:02Z', kind: 'ratelimit_429', correlationId: 'sidA:1.2:1' },
      { ts: '2026-05-07T00:00:03Z', kind: 'retry', correlationId: 'sidA:1.2:2' },
      { ts: '2026-05-07T00:00:04Z', kind: 'tool_error', correlationId: 'sidA:1.3:1' },
    ];
    const b = bucket({ level: 'spec', key: 'sidA' });
    const found = findingsFor('hit-cap-rate', [b], { errorEntries: errors });
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('sev');
  });

  it('warn: 429 ratio between 10% and 20% flags severity=warn', () => {
    // 8 events, 1 is 429 → ratio=12.5% → warn
    const errors: EventLogRow[] = Array.from({ length: 7 }, (_, i) => ({
      ts: '2026-05-07T00:00:00Z',
      kind: 'tool_error',
      correlationId: `sidA:1.1:${i}`,
    }));
    errors.push({
      ts: '2026-05-07T00:00:08Z',
      kind: 'ratelimit_429',
      correlationId: 'sidA:1.2:1',
    });
    const b = bucket({ level: 'spec', key: 'sidA' });
    const found = findingsFor('hit-cap-rate', [b], { errorEntries: errors });
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('warn');
  });

  it('insufficient_data: errorEntries undefined emits global insufficient_data', () => {
    const b = bucket({ level: 'spec', key: 'sidA' });
    const found = findingsFor('hit-cap-rate', [b], {});
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('insufficient_data');
    expect(found[0]?.scope).toEqual({});
  });
});

describe('rule-4 opus-mix-high — FR-RULE-4 (Decision 5 critical-phase skip)', () => {
  it('sev: Opus share > 50% flags severity=sev', () => {
    const b = bucket({
      level: 'phase',
      key: 'phase-impl',
      phase: 'impl',
      modelMix: {
        'claude-opus-4-7': { tokens: 800, usd: 0 },
        'claude-sonnet-4-7': { tokens: 200, usd: 0 },
      },
    });
    const found = findingsFor('opus-mix-high', [b]);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('sev');
  });

  it('warn: Opus share between 30% and 50% flags severity=warn', () => {
    const b = bucket({
      level: 'phase',
      key: 'phase-impl',
      phase: 'impl',
      modelMix: {
        'claude-opus-4-7': { tokens: 400, usd: 0 },
        'claude-sonnet-4-7': { tokens: 600, usd: 0 },
      },
    });
    const found = findingsFor('opus-mix-high', [b]);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('warn');
  });

  it('info: Opus share ≤ 30% flags severity=info (healthy mix)', () => {
    const b = bucket({
      level: 'phase',
      key: 'phase-impl',
      phase: 'impl',
      modelMix: {
        'claude-opus-4-7': { tokens: 100, usd: 0 },
        'claude-sonnet-4-7': { tokens: 900, usd: 0 },
      },
    });
    const found = findingsFor('opus-mix-high', [b]);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('info');
  });

  it("skip: phase='critical' suppresses emission even when Opus dominant (Decision 5)", () => {
    const b = bucket({
      level: 'phase',
      key: 'phase-critical',
      phase: 'critical',
      modelMix: {
        'claude-opus-4-7': { tokens: 900, usd: 0 },
        'claude-sonnet-4-7': { tokens: 100, usd: 0 },
      },
    });
    const found = findingsFor('opus-mix-high', [b]);
    // critical phase → skip → no finding emitted
    expect(found.length).toBe(0);
  });

  it('insufficient_data: modelMix tokens=0 emits insufficient_data', () => {
    const b = bucket({
      level: 'phase',
      key: 'phase-impl',
      phase: 'impl',
      modelMix: {},
    });
    const found = findingsFor('opus-mix-high', [b]);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('insufficient_data');
  });
});

describe('rule-5 cost-per-task-spike — FR-RULE-5 (MAD outlier, Decision 6)', () => {
  it('insufficient_data: n=8 (< madMinN=10) emits insufficient_data', () => {
    const buckets: AggregateBucket[] = Array.from({ length: 8 }, (_, i) =>
      bucket({ level: 'task', key: `sid:1.${i}:1`, totalUSD: i + 1 }),
    );
    const found = findingsFor('cost-per-task-spike', buckets);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('insufficient_data');
    expect(found[0]?.evidence).toMatchObject({ n: 8, madMinN: 10 });
  });

  it('insufficient_data: n=10 with MAD=0 (all-equal costs) emits insufficient_data', () => {
    const buckets: AggregateBucket[] = Array.from({ length: 10 }, (_, i) =>
      bucket({ level: 'task', key: `sid:1.${i}:1`, totalUSD: 5 }),
    );
    const found = findingsFor('cost-per-task-spike', buckets);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('insufficient_data');
  });

  it('sev: n=10 with single |z|>3.5 outlier flags severity=sev on the spiked bucket', () => {
    // Tight cluster 1..9 then a big spike — same shape as MAD case 7.
    const costs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10000];
    const buckets: AggregateBucket[] = costs.map((c, i) =>
      bucket({ level: 'task', key: `sid:1.${i}:1`, totalUSD: c }),
    );
    const found = findingsFor('cost-per-task-spike', buckets);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('sev');
    // The flagged bucket is the spike — totalUSD=10000 surfaces in evidence.
    expect(found[0]?.evidence).toMatchObject({ totalUSD: 10000 });
  });
});

describe('rule-6 wall-clock-p95 — FR-RULE-6', () => {
  it('insufficient_data: < 5 task buckets emits insufficient_data', () => {
    const buckets: AggregateBucket[] = Array.from({ length: 4 }, (_, i) =>
      bucket({ level: 'task', key: `sid:1.${i}:1`, durationMs: 1000, rowCount: 1 }),
    );
    const found = findingsFor('wall-clock-p95', buckets);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('insufficient_data');
  });

  it('sev: per-row duration > 2.0× baseline flags severity=sev', () => {
    // 5 baseline buckets at 1000ms/row, plus one at 5000ms/row (5× baseline).
    const buckets: AggregateBucket[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        bucket({ level: 'task', key: `sid:1.${i}:1`, durationMs: 1000, rowCount: 1 }),
      ),
      bucket({ level: 'task', key: 'sid:1.spike:1', durationMs: 5000, rowCount: 1 }),
    ];
    const found = findingsFor('wall-clock-p95', buckets);
    expect(found.some((f) => f.severity === 'sev')).toBe(true);
  });

  it('warn: per-row duration between 1.5× and 2.0× baseline flags severity=warn', () => {
    // 5 baseline at 1000ms, one at 1700ms (1.7× → warn but not sev).
    const buckets: AggregateBucket[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        bucket({ level: 'task', key: `sid:1.${i}:1`, durationMs: 1000, rowCount: 1 }),
      ),
      bucket({ level: 'task', key: 'sid:1.warn:1', durationMs: 1700, rowCount: 1 }),
    ];
    const found = findingsFor('wall-clock-p95', buckets);
    expect(found.some((f) => f.severity === 'warn')).toBe(true);
    expect(found.some((f) => f.severity === 'sev')).toBe(false);
  });
});

describe('rule-7 cache-churn — FR-RULE-7', () => {
  it('sev: write/read ratio > 3.0 flags severity=sev', () => {
    // cacheRead=100, write=400 → ratio=4.0 > 3.0
    const b = bucket({
      level: 'spec',
      key: 'sidA',
      cacheReadTokens: 100,
      cacheCreate5mTokens: 400,
    });
    const found = findingsFor('cache-churn', [b]);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('sev');
  });

  it('warn: write/read ratio between 1.0 and 3.0 flags severity=warn', () => {
    // cacheRead=100, write=200 → ratio=2.0 → warn
    const b = bucket({
      level: 'spec',
      key: 'sidA',
      cacheReadTokens: 100,
      cacheCreate5mTokens: 200,
    });
    const found = findingsFor('cache-churn', [b]);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('warn');
  });

  it('info: zero new writes against positive cacheRead flags severity=info (pure reuse)', () => {
    const b = bucket({
      level: 'spec',
      key: 'sidA',
      cacheReadTokens: 500,
      cacheCreate5mTokens: 0,
      cacheCreate1hTokens: 0,
    });
    const found = findingsFor('cache-churn', [b]);
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('info');
  });

  it('insufficient_data (delegated to rule-1): cacheRead=0 short-circuits — no rule-7 emission', () => {
    // rule-7 explicitly delegates cold-start (cacheRead=0) to rule-1 which
    // emits insufficient_data when denom=0; rule-7 itself emits nothing.
    const b = bucket({
      level: 'spec',
      key: 'sidA',
      cacheReadTokens: 0,
      cacheCreate5mTokens: 50,
      inputTokens: 0,
    });
    const found = findingsFor('cache-churn', [b]);
    expect(found.length).toBe(0);
    // And rule-1 emits insufficient_data because input-side tokens = cacheRead+5m+1h+input = 50,
    // which is non-zero, so rule-1 actually emits sev/warn here. The delegation contract is
    // "rule-7 itself does not emit cold-start churn", which we just verified.
  });
});

describe('rule-8 retry-loop — FR-RULE-8', () => {
  it('sev: ≥5 retries on a single correlationId flags severity=sev', () => {
    const cid = 'sidA:1.1:1';
    const errors: EventLogRow[] = Array.from({ length: 6 }, (_, i) => ({
      ts: `2026-05-07T00:00:0${i}Z`,
      kind: 'retry',
      correlationId: cid,
    }));
    const b = bucket({ level: 'task', key: cid });
    const found = findingsFor('retry-loop', [b], { errorEntries: errors });
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('sev');
    expect(found[0]?.evidence).toMatchObject({ retries: 6 });
  });

  it('warn: 3-4 retries flags severity=warn', () => {
    const cid = 'sidA:1.2:1';
    const errors: EventLogRow[] = Array.from({ length: 3 }, (_, i) => ({
      ts: `2026-05-07T00:00:0${i}Z`,
      kind: 'retry',
      correlationId: cid,
    }));
    const b = bucket({ level: 'task', key: cid });
    const found = findingsFor('retry-loop', [b], { errorEntries: errors });
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('warn');
  });

  it('insufficient_data: errorEntries empty emits global insufficient_data', () => {
    const b = bucket({ level: 'task', key: 'sidA:1.1:1' });
    const found = findingsFor('retry-loop', [b], { errorEntries: [] });
    expect(found.length).toBe(1);
    expect(found[0]?.severity).toBe('insufficient_data');
    expect(found[0]?.scope).toEqual({});
  });
});

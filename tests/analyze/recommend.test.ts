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

import { describe, it, expect } from 'vitest';

import { findOutliers, modifiedZScore } from '../../src/analyze/recommend.ts';

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

// recommend.ts — Phase 3.7 SKELETON ONLY
//
// 8-rule recommendation engine + MAD robust z-score outlier detector.
//
// References:
//   • design.md §Components #3 (table of 8 rules + REC_THRESHOLDS)
//   • design.md Decision 6 (madMinN = 10, conservative ≥ research §MAD MIN_N=5)
//   • requirements.md §FR-RULE-1..8
//   • research.md §MAD Robust Z-Score — 22 LOC pure-JS reference impl
//
// Decision 6 rationale (design.md L215): research §MAD uses MIN_N=5 as the raw
// short-circuit, but design takes the more conservative madMinN=10 to align
// with NFR-10 ("insufficient_data" surfaces explicitly when n < 10). Rule-5
// (cost-per-task-spike) consults `madMinN` to decide insufficient_data vs
// emit; the 22-LOC reference itself keeps MIN_N=10 here so the two thresholds
// stay co-located.
//
// Phase 4 (Tasks 4.1+) will land the 8 rule bodies — this file ONLY exposes
// the threshold constant + MAD primitives + a placeholder `recommend()`.

import type { AggregateBucket, Recommendation } from './types';

/**
 * Threshold constants for the 8 recommendation rules.
 *
 * Numbers sourced from design.md §Components #3 table (which itself cites
 * research §Threshold). Frozen so callers cannot mutate at runtime.
 *
 * `madMinN: 10` — Decision 6: minimum sample size before MAD-based rule-5
 * (cost-per-task-spike) emits anything other than `insufficient_data`. Set
 * conservatively to 10 (NIST recommends ≥ 10 for robust z-score reliability)
 * even though research §MAD short-circuit uses MIN_N=5 internally.
 */
export const REC_THRESHOLDS = {
  cacheHitWarn: 0.60,
  cacheHitSev: 0.30,
  outputTokWarn: 8000,
  outputTokSev: 16000,
  hitCapWarn: 0.10,
  hitCapSev: 0.20,
  opusMixWarn: 0.30,
  opusMixSev: 0.50,
  madZ: 3.5,
  wallClockWarn: 1.5,
  wallClockSev: 2.0,
  cacheChurnWarn: 1.0,
  cacheChurnSev: 3.0,
  retryWarn: 3,
  retrySev: 5,
  madMinN: 10,
} as const;

// --- MAD robust z-score (research §MAD 22-LOC reference) ----------------------
//
// Iglewicz & Hoaglin (1993) modified z-score:
//   modified_z = SCALE * (x - median(X)) / MAD(X)
//   MAD = median(|x_i - median(X)|)
//   |z| > Z_THRESHOLD → outlier
//
// Edge cases all return `[]` (no outliers) — never throws, never falls back to
// std-dev (avoids masking by outliers themselves):
//   • N < MIN_N           → all zeros (no outliers)
//   • MAD = 0 (≥ 50% identical / all-equal) → all zeros (no outliers)
//   • N = 0, 1            → empty / single zero
//
// MIN_N=10 here matches REC_THRESHOLDS.madMinN per Decision 6 (raised from
// research §MAD's MIN_N=5 baseline). Z_THRESHOLD=3.5 and SCALE=0.6745 are the
// canonical Iglewicz & Hoaglin constants and stay literal.

const MIN_N = 10;
const Z_THRESHOLD = 3.5;
const SCALE = 0.6745;

function median(sorted: number[]): number {
  const n = sorted.length;
  const m = n >> 1;
  if (n === 0) return 0;
  return n % 2 ? (sorted[m] as number) : ((sorted[m - 1] as number) + (sorted[m] as number)) / 2;
}

/**
 * Modified z-scores per Iglewicz & Hoaglin (1993).
 *
 * @returns array of same length as `values`. Each entry is the modified z;
 *   when N < MIN_N or MAD = 0 every entry is 0 (caller treats as "no signal").
 *   Input array is NOT mutated.
 */
export function modifiedZScore(values: number[]): number[] {
  if (values.length < MIN_N) return values.map(() => 0);
  const sorted = [...values].sort((a, b) => a - b);
  const med = median(sorted);
  const devs = values.map((v) => Math.abs(v - med));
  const mad = median([...devs].sort((a, b) => a - b));
  if (mad === 0) return values.map(() => 0);
  return values.map((v) => (SCALE * (v - med)) / mad);
}

/**
 * Indices of outliers — entries where |modifiedZScore| > Z_THRESHOLD (3.5).
 *
 * Returns `[]` when N < MIN_N, MAD = 0, or no entries cross the threshold.
 * Never throws; input is not mutated.
 */
export function findOutliers(values: number[]): number[] {
  const z = modifiedZScore(values);
  const out: number[] = [];
  for (let i = 0; i < z.length; i++) {
    const zi = z[i];
    if (zi !== undefined && Math.abs(zi) > Z_THRESHOLD) out.push(i);
  }
  return out;
}

// --- recommend() placeholder --------------------------------------------------
//
// Phase 4 will land 8 rule bodies (FR-RULE-1..8) here. This skeleton returns
// `[]` so callers (cost.ts orchestrator, report.ts renderer) can wire the
// surface area now without waiting for rule logic.

/**
 * Run the 8-rule recommendation engine over aggregated buckets.
 *
 * SKELETON — Phase 3.7. Returns `[]` until Task 4.1 lands FR-RULE-1..8.
 *
 * @param buckets aggregated cost/usage buckets at spec/phase/task level
 * @param ctx     runtime context — `criticalPhases` skips rule-4 for those
 *                phase tags (e.g. `['critical', 'debug-hard', 'security']`)
 */
export function recommend(
  buckets: AggregateBucket[],
  ctx?: { criticalPhases?: string[] },
): Recommendation[] {
  // Phase 4: implement FR-RULE-1..8 dispatch here.
  void buckets;
  void ctx;
  return [];
}

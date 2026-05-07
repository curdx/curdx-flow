// recommend.ts — 8-rule recommendation engine + MAD robust z-score outlier
// detector.
//
// References:
//   • design.md §Components #3 (table of 8 rules + REC_THRESHOLDS)
//   • design.md Decision 5 (rule-4 critical phase skip list)
//   • design.md Decision 6 (madMinN = 10, conservative ≥ research §MAD MIN_N=5)
//   • design.md Decision 7 (4-tier severity ladder with insufficient_data)
//   • requirements.md §FR-RULE-1..8 / §NFR-5 / §NFR-9 / §NFR-10 / §AC6
//   • research.md §MAD Robust Z-Score — 22-LOC pure-JS reference impl
//
// Per NFR-9 every rule body is wrapped in try/catch — a thrown rule degrades to
// no findings (logged TODO: route to logHookEvent once `analyze_internal_error`
// joins the EventKind union, see cost.ts L177 for the same deferral).
//
// Decision 7 ladder: 'info' | 'warn' | 'sev' | 'insufficient_data' (4 tiers).
// `insufficient_data` is emitted explicitly when a rule cannot compute a
// verdict (NFR-10 — never silently render OK).

import type {
  AggregateBucket,
  EventLogRow,
  Recommendation,
  Severity,
  UsageRow,
} from './types';

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

/**
 * Phases where rule-4 (opus-mix-high) is skipped to avoid false-positive churn
 * during high-stakes work (Decision 5). MVP hardcoded; future: read
 * `meta.criticalPhase` from spec state-file.
 */
export const CRITICAL_PHASES: ReadonlyArray<string> = [
  'critical',
  'debug-hard',
  'security',
] as const;

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

// --- Helpers ------------------------------------------------------------------

/**
 * Compose a stable scope object from a bucket's level + key. Trailing
 * undefined fields stay undefined (not the literal string "undefined") so
 * downstream JSON consumers can treat them as missing.
 */
function bucketScope(b: AggregateBucket): { spec?: string; phase?: string; task?: string } {
  if (b.level === 'spec') return { spec: b.key };
  if (b.level === 'phase') {
    const out: { spec?: string; phase?: string } = {};
    if (b.spec !== undefined) out.spec = b.spec;
    out.phase = b.phase ?? b.key;
    return out;
  }
  // task
  const out: { spec?: string; phase?: string; task?: string } = { task: b.key };
  if (b.spec !== undefined) out.spec = b.spec;
  if (b.phase !== undefined) out.phase = b.phase;
  return out;
}

/** Format a fraction as "NN%" with one decimal — for human-readable messages. */
function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** Heuristic check whether a model id refers to the Opus family. */
function isOpusModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('opus');
}

/**
 * recommend() context.
 *
 * - `errorEntries` — all rows from `errors.jsonl` (post `loadErrorEntries`),
 *   used by rule-3 (ratelimit_429 ratio) and rule-8 (retry counts). When
 *   absent or empty, those rules emit `insufficient_data`.
 * - `phase` — the active phase tag for the *current* run (used by rule-4
 *   global-skip mode); per-bucket phase comes from `bucket.phase` and is the
 *   primary signal — `ctx.phase` is only consulted as a fallback when the
 *   bucket has no phase.
 * - `criticalPhases` — override list of phases where rule-4 is suppressed
 *   (defaults to `CRITICAL_PHASES`).
 */
export interface RecommendContext {
  errorEntries?: EventLogRow[];
  phase?: string;
  criticalPhases?: ReadonlyArray<string>;
  /** Optional: per-row outputTokens stream for rule-2 (defaults to bucket avg). */
  rows?: UsageRow[];
}

// --- 8 rule bodies (each NEVER-throw; catches at the dispatch layer too) ------

/**
 * FR-RULE-1 cache-hit-low — bucket cacheRead / (cacheRead + 5m + 1h + input).
 *
 * The `+ inputTokens` term in the denominator makes this the *effective* hit
 * rate (cache reads vs all "input-side" tokens entering the model). When the
 * denominator is 0 (no traffic) the rule emits `insufficient_data`.
 *
 * scope: spec / phase / task (any level).
 */
function ruleCacheHitLow(buckets: AggregateBucket[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const b of buckets) {
    try {
      const denom =
        b.cacheReadTokens + b.cacheCreate5mTokens + b.cacheCreate1hTokens + b.inputTokens;
      if (denom <= 0) {
        out.push({
          rule: 'cache-hit-low',
          severity: 'insufficient_data',
          scope: bucketScope(b),
          message: `cache-hit-low: n=0 input-side tokens; 数据不足以判断`,
          evidence: { cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 0, inputTokens: 0 },
        });
        continue;
      }
      const hit = b.cacheReadTokens / denom;
      let severity: Severity | null = null;
      if (hit < REC_THRESHOLDS.cacheHitSev) severity = 'sev';
      else if (hit < REC_THRESHOLDS.cacheHitWarn) severity = 'warn';
      else severity = 'info';
      // info tier: only emit when we actually beat warn (lifestyle nudge).
      if (severity === 'info' && hit < REC_THRESHOLDS.cacheHitWarn) continue;
      out.push({
        rule: 'cache-hit-low',
        severity,
        scope: bucketScope(b),
        message:
          severity === 'info'
            ? `cache-hit-low: ${pct(hit)} ≥ ${pct(REC_THRESHOLDS.cacheHitWarn)} (healthy); cache discipline is paying off`
            : `cache-hit-low: ${pct(hit)} < ${pct(severity === 'sev' ? REC_THRESHOLDS.cacheHitSev : REC_THRESHOLDS.cacheHitWarn)} threshold; suggest extracting constants/prompts to system prompt to widen cache surface`,
        evidence: {
          cacheRead: b.cacheReadTokens,
          cacheCreate5m: b.cacheCreate5mTokens,
          cacheCreate1h: b.cacheCreate1hTokens,
          inputTokens: b.inputTokens,
          hitRate: hit,
        },
      });
    } catch {
      // NFR-9: swallow per-bucket errors so one bad row never derails the engine.
    }
  }
  return out;
}

/**
 * FR-RULE-2 output-tok-high — bucket avg outputTokens per row > thresholds.
 *
 * Computed at task scope only (per design table). When buckets are spec/phase
 * we still emit one finding per task-level bucket; non-task buckets are
 * skipped. Average is `outputTokens / rowCount` to normalize across buckets
 * with very different row counts.
 */
function ruleOutputTokHigh(buckets: AggregateBucket[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const b of buckets) {
    if (b.level !== 'task') continue;
    try {
      if (b.rowCount <= 0) {
        out.push({
          rule: 'output-tok-high',
          severity: 'insufficient_data',
          scope: bucketScope(b),
          message: `output-tok-high: rowCount=0; 数据不足以判断`,
          evidence: { outputTokens: b.outputTokens, rowCount: 0 },
        });
        continue;
      }
      const avg = b.outputTokens / b.rowCount;
      let severity: Severity | null = null;
      if (avg > REC_THRESHOLDS.outputTokSev) severity = 'sev';
      else if (avg > REC_THRESHOLDS.outputTokWarn) severity = 'warn';
      if (!severity) continue; // healthy; no info tier per design (rule 1/4/7 only)
      out.push({
        rule: 'output-tok-high',
        severity,
        scope: bucketScope(b),
        message: `output-tok-high: avg ${Math.round(avg)} output tok/turn > ${
          severity === 'sev' ? REC_THRESHOLDS.outputTokSev : REC_THRESHOLDS.outputTokWarn
        } threshold; suggest splitting task or capping max_tokens`,
        evidence: {
          avgOutputTokens: avg,
          totalOutputTokens: b.outputTokens,
          rowCount: b.rowCount,
        },
      });
    } catch {
      // NFR-9.
    }
  }
  return out;
}

/**
 * FR-RULE-3 hit-cap-rate — events.jsonl `kind='ratelimit_429'` ratio > thresholds.
 *
 * Spec scope (bucket-agnostic) — counts 429s across all error entries scoped
 * to the same correlationId sid prefix as each spec-level bucket. When
 * `errorEntries` is absent or contains 0 rows, emits `insufficient_data`.
 */
function ruleHitCapRate(
  buckets: AggregateBucket[],
  errorEntries: EventLogRow[] | undefined,
): Recommendation[] {
  const out: Recommendation[] = [];
  if (!errorEntries || errorEntries.length === 0) {
    // Surface insufficient_data once at global scope rather than per-bucket spam.
    return [
      {
        rule: 'hit-cap-rate',
        severity: 'insufficient_data',
        scope: {},
        message: `hit-cap-rate: errors.jsonl 中无 ratelimit_429 / 总事件信号；数据不足以判断`,
        evidence: { errorEntries: 0 },
      },
    ];
  }
  for (const b of buckets) {
    if (b.level !== 'spec') continue;
    try {
      const sid = b.key;
      const scoped = errorEntries.filter((e) => {
        const cid = e.correlationId;
        return typeof cid === 'string' && cid.startsWith(`${sid}:`);
      });
      if (scoped.length === 0) continue; // spec has no errors at all → no signal
      const cap = scoped.filter((e) => e.kind === 'ratelimit_429').length;
      const ratio = cap / scoped.length;
      let severity: Severity | null = null;
      if (ratio > REC_THRESHOLDS.hitCapSev) severity = 'sev';
      else if (ratio > REC_THRESHOLDS.hitCapWarn) severity = 'warn';
      if (!severity) continue;
      out.push({
        rule: 'hit-cap-rate',
        severity,
        scope: bucketScope(b),
        message: `hit-cap-rate: ${pct(ratio)} of events were 429 rate-limit hits > ${pct(
          severity === 'sev' ? REC_THRESHOLDS.hitCapSev : REC_THRESHOLDS.hitCapWarn,
        )} threshold; suggest backing off concurrency or upgrading tier`,
        evidence: { rateLimitedCount: cap, totalEvents: scoped.length, ratio },
      });
    } catch {
      // NFR-9.
    }
  }
  return out;
}

/**
 * FR-RULE-4 opus-mix-high — bucket.modelMix Opus token share > thresholds.
 *
 * Phase scope (per design table). Suppressed when `bucket.phase` (or
 * `ctx.phase` fallback) is in `criticalPhases` — high-stakes work is
 * legitimately Opus-heavy, suppressing avoids false-positive churn (Decision 5).
 */
function ruleOpusMixHigh(
  buckets: AggregateBucket[],
  ctx: RecommendContext,
): Recommendation[] {
  const out: Recommendation[] = [];
  const skipList = ctx.criticalPhases ?? CRITICAL_PHASES;
  for (const b of buckets) {
    if (b.level !== 'phase') continue;
    try {
      const phase = b.phase ?? ctx.phase;
      if (phase === undefined) {
        out.push({
          rule: 'opus-mix-high',
          severity: 'insufficient_data',
          scope: bucketScope(b),
          message: `opus-mix-high: phase tag 缺失; 数据不足以判断`,
          evidence: { reason: 'no-phase-tag' },
        });
        continue;
      }
      if (skipList.includes(phase)) continue; // critical phase skip (Decision 5)
      const mix = b.modelMix;
      let totalTok = 0;
      let opusTok = 0;
      for (const [model, m] of Object.entries(mix)) {
        totalTok += m.tokens;
        if (isOpusModel(model)) opusTok += m.tokens;
      }
      if (totalTok <= 0) {
        out.push({
          rule: 'opus-mix-high',
          severity: 'insufficient_data',
          scope: bucketScope(b),
          message: `opus-mix-high: modelMix tokens=0; 数据不足以判断`,
          evidence: { totalTokens: 0 },
        });
        continue;
      }
      const share = opusTok / totalTok;
      let severity: Severity;
      if (share > REC_THRESHOLDS.opusMixSev) severity = 'sev';
      else if (share > REC_THRESHOLDS.opusMixWarn) severity = 'warn';
      else severity = 'info';
      // info tier is the "healthy" branch (share ≤ warnThreshold) — emit per design
      out.push({
        rule: 'opus-mix-high',
        severity,
        scope: bucketScope(b),
        message:
          severity === 'info'
            ? `opus-mix-high: Opus share ${pct(share)} ≤ ${pct(REC_THRESHOLDS.opusMixWarn)} (healthy mix)`
            : `opus-mix-high: Opus share ${pct(share)} > ${pct(
                severity === 'sev' ? REC_THRESHOLDS.opusMixSev : REC_THRESHOLDS.opusMixWarn,
              )} threshold; suggest routing routine work to Sonnet/Haiku`,
        evidence: { opusTokens: opusTok, totalTokens: totalTok, share, phase },
      });
    } catch {
      // NFR-9.
    }
  }
  return out;
}

/**
 * FR-RULE-5 cost-per-task-spike — MAD on task-level totalUSD array.
 *
 * Single severity tier (sev) per design table — a |z| > 3.5 outlier is a
 * real spike, not a gradient. n < madMinN (10) or MAD = 0 → one
 * `insufficient_data` finding at global scope (avoid per-bucket spam).
 */
function ruleCostPerTaskSpike(buckets: AggregateBucket[]): Recommendation[] {
  const out: Recommendation[] = [];
  try {
    const taskBuckets = buckets.filter((b) => b.level === 'task');
    if (taskBuckets.length < REC_THRESHOLDS.madMinN) {
      return [
        {
          rule: 'cost-per-task-spike',
          severity: 'insufficient_data',
          scope: {},
          message: `cost-per-task-spike: n=${taskBuckets.length} < ${REC_THRESHOLDS.madMinN}; 数据不足以判断 (MAD 需 ≥ ${REC_THRESHOLDS.madMinN} 个 task bucket)`,
          evidence: { n: taskBuckets.length, madMinN: REC_THRESHOLDS.madMinN },
        },
      ];
    }
    const values = taskBuckets.map((b) => b.totalUSD);
    const z = modifiedZScore(values);
    const allZero = z.every((v) => v === 0);
    if (allZero) {
      // MAD=0 (≥50% identical buckets) — flat distribution, can't detect spikes.
      return [
        {
          rule: 'cost-per-task-spike',
          severity: 'insufficient_data',
          scope: {},
          message: `cost-per-task-spike: MAD=0 (≥50% identical task costs); 数据不足以判断`,
          evidence: { n: values.length, mad: 0 },
        },
      ];
    }
    const outlierIndices = findOutliers(values);
    for (const idx of outlierIndices) {
      const b = taskBuckets[idx];
      const zi = z[idx];
      if (!b || zi === undefined) continue;
      out.push({
        rule: 'cost-per-task-spike',
        severity: 'sev',
        scope: bucketScope(b),
        message: `cost-per-task-spike: $${b.totalUSD.toFixed(4)} USD with |z|=${Math.abs(zi).toFixed(2)} > ${REC_THRESHOLDS.madZ} (MAD outlier); inspect task for runaway loop or oversized prompt`,
        evidence: { totalUSD: b.totalUSD, modifiedZ: zi, n: values.length },
      });
    }
  } catch {
    // NFR-9.
  }
  return out;
}

/**
 * FR-RULE-6 wall-clock-p95 — task-level durationMs / rowCount p95 vs baseline.
 *
 * Approximation note: design table specifies "per-kind p95 vs 30d baseline";
 * MVP simplification (Decision deferred to follow-up) — use *median of
 * task-bucket per-row durations* as the baseline, then flag buckets whose own
 * per-row duration exceeds `wallClockWarn|Sev × baseline`. Skip if n < 5
 * (too few buckets to derive a meaningful baseline).
 */
function ruleWallClockP95(buckets: AggregateBucket[]): Recommendation[] {
  const out: Recommendation[] = [];
  try {
    const taskBuckets = buckets.filter((b) => b.level === 'task' && b.rowCount > 0);
    if (taskBuckets.length < 5) {
      return [
        {
          rule: 'wall-clock-p95',
          severity: 'insufficient_data',
          scope: {},
          message: `wall-clock-p95: n=${taskBuckets.length} < 5 task buckets; 数据不足以判断`,
          evidence: { n: taskBuckets.length },
        },
      ];
    }
    const perRowDur = taskBuckets.map((b) => b.durationMs / Math.max(b.rowCount, 1));
    const sorted = [...perRowDur].sort((a, b) => a - b);
    const baseline = median(sorted);
    if (baseline <= 0) {
      return [
        {
          rule: 'wall-clock-p95',
          severity: 'insufficient_data',
          scope: {},
          message: `wall-clock-p95: baseline duration=0; 数据不足以判断`,
          evidence: { n: taskBuckets.length, baseline: 0 },
        },
      ];
    }
    const warnLine = REC_THRESHOLDS.wallClockWarn * baseline;
    const sevLine = REC_THRESHOLDS.wallClockSev * baseline;
    for (let i = 0; i < taskBuckets.length; i++) {
      const b = taskBuckets[i];
      const dur = perRowDur[i];
      if (!b || dur === undefined) continue;
      let severity: Severity | null = null;
      if (dur > sevLine) severity = 'sev';
      else if (dur > warnLine) severity = 'warn';
      if (!severity) continue;
      out.push({
        rule: 'wall-clock-p95',
        severity,
        scope: bucketScope(b),
        message: `wall-clock-p95: ${Math.round(dur)}ms/turn > ${
          severity === 'sev' ? REC_THRESHOLDS.wallClockSev : REC_THRESHOLDS.wallClockWarn
        }× baseline (${Math.round(baseline)}ms); inspect for tool-call thrash or slow MCP server`,
        evidence: {
          durationPerRowMs: dur,
          baselineMs: baseline,
          ratio: dur / baseline,
          rowCount: b.rowCount,
        },
      });
    }
  } catch {
    // NFR-9.
  }
  return out;
}

/**
 * FR-RULE-7 cache-churn — bucket cacheCreate sum / cacheRead sum > thresholds.
 *
 * Spec/phase scope. Only emits when `cacheRead > 0` (otherwise this is
 * "cold start" not "churn"). When cacheRead=0 we delegate to rule-1
 * (cache-hit-low → insufficient_data) rather than double-flagging.
 */
function ruleCacheChurn(buckets: AggregateBucket[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const b of buckets) {
    if (b.level !== 'spec' && b.level !== 'phase') continue;
    try {
      if (b.cacheReadTokens <= 0) continue; // cold start, not churn — rule-1 handles
      const writeTotal = b.cacheCreate5mTokens + b.cacheCreate1hTokens;
      if (writeTotal <= 0) {
        // Healthy: cache reads with zero new writes = pure reuse.
        out.push({
          rule: 'cache-churn',
          severity: 'info',
          scope: bucketScope(b),
          message: `cache-churn: zero new cache writes against ${b.cacheReadTokens} cached reads (pure reuse, healthy)`,
          evidence: { cacheRead: b.cacheReadTokens, cacheCreate5m: 0, cacheCreate1h: 0, ratio: 0 },
        });
        continue;
      }
      const ratio = writeTotal / b.cacheReadTokens;
      let severity: Severity | null = null;
      if (ratio > REC_THRESHOLDS.cacheChurnSev) severity = 'sev';
      else if (ratio > REC_THRESHOLDS.cacheChurnWarn) severity = 'warn';
      else severity = 'info';
      if (severity === 'info') {
        // emit a healthy info note only when ratio is genuinely low
        if (ratio > REC_THRESHOLDS.cacheChurnWarn) continue;
      }
      out.push({
        rule: 'cache-churn',
        severity,
        scope: bucketScope(b),
        message:
          severity === 'info'
            ? `cache-churn: write/read ratio ${ratio.toFixed(2)} ≤ ${REC_THRESHOLDS.cacheChurnWarn} (healthy reuse)`
            : `cache-churn: write/read ratio ${ratio.toFixed(2)} > ${
                severity === 'sev' ? REC_THRESHOLDS.cacheChurnSev : REC_THRESHOLDS.cacheChurnWarn
              } threshold; cache is being rebuilt faster than reused — check for prompt instability or session churn`,
        evidence: {
          cacheRead: b.cacheReadTokens,
          cacheCreate5m: b.cacheCreate5mTokens,
          cacheCreate1h: b.cacheCreate1hTokens,
          ratio,
        },
      });
    } catch {
      // NFR-9.
    }
  }
  return out;
}

/**
 * FR-RULE-8 retry-loop — events.jsonl `kind='retry'` count per correlationId.
 *
 * Task scope. Counts retries grouped by correlationId from `errorEntries`.
 * When errorEntries is absent / empty, emits one `insufficient_data` at
 * global scope.
 */
function ruleRetryLoop(
  buckets: AggregateBucket[],
  errorEntries: EventLogRow[] | undefined,
): Recommendation[] {
  const out: Recommendation[] = [];
  if (!errorEntries || errorEntries.length === 0) {
    return [
      {
        rule: 'retry-loop',
        severity: 'insufficient_data',
        scope: {},
        message: `retry-loop: errors.jsonl 无 retry 记录; 数据不足以判断`,
        evidence: { errorEntries: 0 },
      },
    ];
  }
  try {
    const retryByCorrId = new Map<string, number>();
    for (const e of errorEntries) {
      if (e.kind !== 'retry') continue;
      const cid = e.correlationId;
      if (typeof cid !== 'string' || cid.length === 0) continue;
      retryByCorrId.set(cid, (retryByCorrId.get(cid) ?? 0) + 1);
    }
    if (retryByCorrId.size === 0) {
      // No retries observed at all — healthy
      return [];
    }
    const taskBuckets = buckets.filter((b) => b.level === 'task');
    for (const b of taskBuckets) {
      const count = retryByCorrId.get(b.key) ?? 0;
      let severity: Severity | null = null;
      if (count >= REC_THRESHOLDS.retrySev) severity = 'sev';
      else if (count >= REC_THRESHOLDS.retryWarn) severity = 'warn';
      if (!severity) continue;
      out.push({
        rule: 'retry-loop',
        severity,
        scope: bucketScope(b),
        message: `retry-loop: ${count} retries on this task ≥ ${
          severity === 'sev' ? REC_THRESHOLDS.retrySev : REC_THRESHOLDS.retryWarn
        } threshold; inspect for stuck loop / failing precondition`,
        evidence: { retries: count, correlationId: b.key },
      });
    }
  } catch {
    // NFR-9.
  }
  return out;
}

// --- recommend() dispatch -----------------------------------------------------

/**
 * Run the 8-rule recommendation engine over aggregated buckets.
 *
 * Each rule is wrapped at two layers (per-bucket + dispatch) so a thrown
 * exception in any single rule degrades to "no findings from that rule"
 * rather than aborting the whole recommendation pass — NFR-9.
 *
 * @param buckets aggregated cost/usage buckets (mix of spec/phase/task levels)
 * @param ctx     runtime context — error entries, current phase, critical-phase
 *                skip-list (defaults to `CRITICAL_PHASES`), optional rows.
 * @returns Recommendation[] — never throws, may be empty.
 */
export function recommend(
  buckets: AggregateBucket[],
  ctx: RecommendContext = {},
): Recommendation[] {
  const out: Recommendation[] = [];
  const safe = (fn: () => Recommendation[]): Recommendation[] => {
    try {
      return fn();
    } catch {
      // NFR-9: an entire rule throwing degrades to silence (TODO: route to
      // logHookEvent once 'analyze_internal_error' joins EventKind, see
      // cost.ts L177 for the same deferred plumbing).
      return [];
    }
  };
  out.push(...safe(() => ruleCacheHitLow(buckets))); // FR-RULE-1
  out.push(...safe(() => ruleOutputTokHigh(buckets))); // FR-RULE-2
  out.push(...safe(() => ruleHitCapRate(buckets, ctx.errorEntries))); // FR-RULE-3
  out.push(...safe(() => ruleOpusMixHigh(buckets, ctx))); // FR-RULE-4
  out.push(...safe(() => ruleCostPerTaskSpike(buckets))); // FR-RULE-5
  out.push(...safe(() => ruleWallClockP95(buckets))); // FR-RULE-6
  out.push(...safe(() => ruleCacheChurn(buckets))); // FR-RULE-7
  out.push(...safe(() => ruleRetryLoop(buckets, ctx.errorEntries))); // FR-RULE-8
  return out;
}

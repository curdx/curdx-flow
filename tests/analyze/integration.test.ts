// Integration tests for the analyze pipeline (Phase 3 Task 3.3).
//
// Coverage:
//   1. NFR-1 incremental offset timing (AT-2): runAnalyze on a ~250KB fixture
//      twice — second run resumes from the cached byte offset and replays the
//      cached report, so t2 must be ≪ t1. We assert t2 ≤ t1/5 with an absolute
//      ceiling fallback for fast-SSD machines where t1 is already trivial.
//   2. FR-2 100MB streaming: parseTranscript over a freshly-built ≥100MB temp
//      jsonl yields at least 100k events without RSS growth blowing past 200MB
//      — proves the createReadStream + readline path stays memory-bounded.
//   3. fixture snapshot: runAnalyze({ json: true }) on the canonical sample
//      fixture matches an inline snapshot of the stable counters (counts only,
//      no timing fields).
//
// Isolation strategy (homedir state pollution — rationale below):
//   src/analyze/index.ts computes STATE_DIR = path.join(homedir(), '.claude',
//   'curdx-flow') at module load time. To avoid clobbering the developer's
//   real ~/.claude/curdx-flow/observability-state.json we hoist a vi.mock for
//   'node:os' BEFORE importing runAnalyze, redirecting homedir() to an
//   isolated tmpdir. Each test resets that dir to start from a clean baseline.
//
// CWD strategy (timing test):
//   POC_FIXTURE_REL is resolved against process.cwd(). For the timing test we
//   stage an inflated fixture under <tmpdir>/tests/analyze/fixtures/sample.jsonl
//   and stub process.cwd() to that tmpdir. The default sample fixture is too
//   small (~2.8KB) for stable timing on fast SSDs — a 250KB inflated copy puts
//   t1 reliably above 50ms on the test runner.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  createWriteStream,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Hoist a fake homedir BEFORE the index.ts import below, so STATE_DIR resolves
// into an isolated tmpdir instead of the developer's real ~/.claude. vi.mock
// is hoisted above all imports automatically by vitest's transform — we use
// vi.hoisted so FAKE_HOME is available inside the mock factory.
const { FAKE_HOME } = vi.hoisted(() => {
  // Inline require to avoid pulling in module-level imports during hoisting.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('node:os') as typeof import('node:os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('node:path') as typeof import('node:path');
  return { FAKE_HOME: nodePath.join(nodeOs.tmpdir(), 'curdx-flow-integration-home') };
});

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    default: { ...actual, homedir: () => FAKE_HOME },
    homedir: () => FAKE_HOME,
  };
});

import { runAnalyze } from '../../src/analyze/index.ts';
import { extractUsageRowsFromEvents } from '../../src/analyze/cost.ts';
import { filterEvents } from '../../src/analyze/filter.ts';
import { parseTranscript } from '../../src/analyze/parser.ts';
import type { Counters, Event } from '../../src/analyze/types.ts';

const REAL_FIXTURE = path.resolve(process.cwd(), 'tests/analyze/fixtures/sample.jsonl');
const STATE_DIR = path.join(FAKE_HOME, '.claude', 'curdx-flow');
const STATE_FILE = path.join(STATE_DIR, 'observability-state.json');

function resetFakeHome(): void {
  if (existsSync(FAKE_HOME)) rmSync(FAKE_HOME, { recursive: true, force: true });
  mkdirSync(STATE_DIR, { recursive: true });
}

/**
 * Capture stdout writes during `fn()` and return the concatenated string.
 * runAnalyze writes its rendered output via process.stdout.write — vitest's
 * fork pool means we can spy on the global stdout safely.
 */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write);
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return chunks.join('');
}

describe('analyze integration', () => {
  // Task 1.2 swapped the hardcoded POC_FIXTURE_REL for `resolveTranscriptSource`,
  // which only falls back to the legacy fixture path when CURDX_TRANSCRIPT_FIXTURE
  // is set (AC4). Wire it here so the snapshot test sees the canonical sample
  // and runAnalyze doesn't process.exit(1) on a missing real project dir. The
  // NFR-1 timing test below overrides this to its own inflated copy inside its
  // own try/finally — that path becomes the state.files key (Task 1.2 keys
  // state by source.paths[i], i.e. the env-var-supplied path).
  beforeAll(() => {
    process.env.CURDX_TRANSCRIPT_FIXTURE = REAL_FIXTURE;
  });

  beforeEach(() => {
    resetFakeHome();
  });

  afterAll(() => {
    delete process.env.CURDX_TRANSCRIPT_FIXTURE;
    if (existsSync(FAKE_HOME)) rmSync(FAKE_HOME, { recursive: true, force: true });
  });

  it('NFR-1 timing: second run on cached offset is ≥5x faster (AT-2)', async () => {
    // Stage a ~250KB inflated fixture under a tmpdir so process.cwd() points
    // at a directory that already contains tests/analyze/fixtures/sample.jsonl.
    const cwdSandbox = path.join(tmpdir(), 'curdx-flow-integration-cwd-timing');
    if (existsSync(cwdSandbox)) rmSync(cwdSandbox, { recursive: true, force: true });
    const inflatedFixturePath = path.join(cwdSandbox, 'tests/analyze/fixtures/sample.jsonl');
    mkdirSync(path.dirname(inflatedFixturePath), { recursive: true });
    const fixtureBody = readFileSync(REAL_FIXTURE, 'utf8');
    // ~90 copies → ~250KB, enough for t1 to clear ~50ms on fast SSDs.
    const inflated = fixtureBody.repeat(90);
    writeFileSync(inflatedFixturePath, inflated, 'utf8');

    // Task 1.2: state.files key = source.paths[i] = fixtureOverride (when env
    // var is set). Override the suite-level env var to point at our inflated
    // copy so the assertion below matches and we exercise the same byte-offset
    // resume path. cwdSpy is now redundant for resolution (env var bypasses
    // cwd-based glob) but harmless to keep — kept to minimize surgery.
    const previousFixtureEnv = process.env.CURDX_TRANSCRIPT_FIXTURE;
    process.env.CURDX_TRANSCRIPT_FIXTURE = inflatedFixturePath;
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(cwdSandbox);
    try {
      // First run — full parse, populates state cache.
      const t1Start = performance.now();
      await captureStdout(() => runAnalyze({ json: true }));
      const t1 = performance.now() - t1Start;

      // State file must exist now and record the byteOffset = file size.
      expect(existsSync(STATE_FILE)).toBe(true);
      const stateRaw = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as {
        files: Record<string, { byteOffset: number; sizeBytes: number }>;
      };
      const fixtureSize = statSync(inflatedFixturePath).size;
      expect(stateRaw.files[inflatedFixturePath]?.byteOffset).toBe(fixtureSize);

      // Second run — incremental offset path replays cached lastReportJson.
      const t2Start = performance.now();
      await captureStdout(() => runAnalyze({ json: true }));
      const t2 = performance.now() - t2Start;

      // Surface the timings before asserting so failures show real values.
      // eslint-disable-next-line no-console
      console.log(`  [timing] t1=${t1.toFixed(2)}ms t2=${t2.toFixed(2)}ms ratio=${(t1 / t2).toFixed(1)}x`);

      // Primary assertion: t2 ≤ t1/5. Fallback: if t1 was already trivially
      // fast (<50ms — fast SSD with hot caches), demand absolute t2 < 10ms.
      if (t1 < 50) {
        expect(t2).toBeLessThan(10);
      } else {
        expect(t2).toBeLessThanOrEqual(t1 / 5);
      }
    } finally {
      cwdSpy.mockRestore();
      if (previousFixtureEnv === undefined) {
        delete process.env.CURDX_TRANSCRIPT_FIXTURE;
      } else {
        process.env.CURDX_TRANSCRIPT_FIXTURE = previousFixtureEnv;
      }
      if (existsSync(cwdSandbox)) rmSync(cwdSandbox, { recursive: true, force: true });
    }
  }, 30_000);

  it(
    'FR-2 streaming: parseTranscript over ≥100MB jsonl stays memory-bounded',
    async () => {
      const tempFile = path.join(tmpdir(), 'curdx-flow-integration-100mb.jsonl');
      if (existsSync(tempFile)) unlinkSync(tempFile);

      // Build the temp file by streaming ~37k copies of the fixture body so
      // we never hold the full 100MB in JS memory ourselves. Each copy is
      // ~2.8KB so 37000 × 2.8KB ≈ 104MB.
      const fixtureBody = readFileSync(REAL_FIXTURE, 'utf8');
      const ws = createWriteStream(tempFile, { encoding: 'utf8' });
      // 38k × ~2.8KB ≈ 107MB — comfortably above the 100MB FR-2 threshold.
      const REPEAT = 38_000;
      try {
        for (let i = 0; i < REPEAT; i++) {
          if (!ws.write(fixtureBody)) {
            // Honor backpressure to keep the writer side memory-bounded too.
            await new Promise<void>((resolve) => ws.once('drain', () => resolve()));
          }
        }
      } finally {
        await new Promise<void>((resolve, reject) => {
          ws.end((err?: Error | null) => (err ? reject(err) : resolve()));
        });
      }

      const sizeBytes = statSync(tempFile).size;
      expect(sizeBytes).toBeGreaterThanOrEqual(100 * 1024 * 1024);

      // RSS baseline before streaming. Force GC if exposed (--expose-gc not
      // required; this is best-effort to deflake the diff).
      const gc = (globalThis as { gc?: () => void }).gc;
      if (gc) gc();
      const rssBefore = process.memoryUsage().rss;

      const counters: Counters = { unknown_type: 0, parse_error: 0, processed: 0 };
      let yielded = 0;
      for await (const _ev of parseTranscript(tempFile, 0, undefined, counters)) {
        void _ev;
        yielded += 1;
      }

      if (gc) gc();
      const rssAfter = process.memoryUsage().rss;
      const rssDiffMB = (rssAfter - rssBefore) / (1024 * 1024);

      // eslint-disable-next-line no-console
      console.log(
        `  [streaming] sizeMB=${(sizeBytes / 1024 / 1024).toFixed(1)} ` +
          `yielded=${yielded} processed=${counters.processed} ` +
          `parse_error=${counters.parse_error} unknown_type=${counters.unknown_type} ` +
          `rssDiffMB=${rssDiffMB.toFixed(1)}`,
      );

      // ≥100k events yielded — proves the loop saw the full file, not an
      // early ENOMEM truncation.
      expect(yielded).toBeGreaterThanOrEqual(100_000);
      // RSS growth budget: 200MB. The stream-bounded reader should sit well
      // under this — actual diff observed is typically <50MB.
      expect(rssDiffMB).toBeLessThan(200);

      unlinkSync(tempFile);
    },
    120_000,
  );

  it('fixture snapshot: --json output exposes stable counters', async () => {
    const out = await captureStdout(() => runAnalyze({ json: true }));
    const parsed = JSON.parse(out) as {
      hookFailures: unknown[];
      slashCommands: unknown[];
      subagents: unknown[];
      schemaDrift: { unknownTypeCount: number; parseErrorCount: number };
    };

    // Snapshot only the stable shape — counts and drift counters. We avoid
    // snapshotting full row objects because some carry duration percentiles
    // computed off ts strings (still stable here, but keep the surface tight
    // so future renderer tweaks don't churn this checkpoint).
    expect({
      hookFailuresCount: parsed.hookFailures.length,
      slashCommandsCount: parsed.slashCommands.length,
      subagentsCount: parsed.subagents.length,
      schemaDrift: parsed.schemaDrift,
    }).toMatchInlineSnapshot(`
      {
        "hookFailuresCount": 2,
        "schemaDrift": {
          "parseErrorCount": 1,
          "unknownTypeCount": 2,
        },
        "slashCommandsCount": 2,
        "subagentsCount": 1,
      }
    `);
  });
});

// OB-3 cost pipeline (Task 3.10) — assert the cost branch wires through
// runAnalyze end-to-end with a usage-bearing fixture and that the existing
// 7 flat report sections survive untouched (NFR-6 / FR-REPORT-2).
//
// Why a synthesized fixture instead of /tests/analyze/fixtures/sample-with-usage.jsonl?
//   The Phase 0 fixture intentionally uses dated model ids (e.g.
//   `claude-opus-4-7-20260301`) which `pricing.ts#PRICING` does not carry —
//   `resolveModelId` returns undefined and `computeCost` floors to $0. That is
//   recorded behavior (.progress.md Task 1.7 Learnings) and locks AC0
//   "totalCost.usd != null" but cannot satisfy this task's stricter
//   "totalCost.usd > 0" gate. We stage a sibling fixture in tmpdir whose
//   model ids resolve through PRICING/MODEL_ALIASES so the cost branch
//   produces a real positive figure, AND we re-use the canonical Phase 0
//   fixture's last row (legacy schema — only top-level
//   `cache_creation_input_tokens`) verbatim to exercise FR-PARSER-3 / US-11
//   backward compat round-trip.
describe('OB-3 cost pipeline', () => {
  // Three rows that exercise PRICING for all three models + 1 sidechain
  // (isSidechain:true) + 1 legacy-schema row (no nested cache_creation).
  // Canonical correlationId 3-segment: <sid>:<task>:<iter> (OB-2 lock).
  const COST_FIXTURE_ROWS = [
    // Opus 4.7 — input=1M, output=0, cache_read=0, cache_5m=0, cache_1h=0
    // → 1M × $5/M = $5.0000 expected.
    {
      type: 'assistant',
      timestamp: '2026-05-07T08:00:00.000Z',
      uuid: 'cost-int-0001',
      sessionId: 'cost-sess-001',
      requestId: 'req_opus_int_001',
      correlationId: 'cost-sess-001:1.1:1',
      message: {
        id: 'msg_opus_int_001',
        role: 'assistant',
        model: 'claude-opus-4-7',
        content: [{ type: 'text', text: 'Integration cost row — Opus.' }],
        usage: {
          input_tokens: 1_000_000,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
        },
      },
    },
    // Sonnet 4.6 — output=1M only → 1M × $15/M = $15.0000.
    {
      type: 'assistant',
      timestamp: '2026-05-07T08:00:05.000Z',
      uuid: 'cost-int-0002',
      sessionId: 'cost-sess-001',
      requestId: 'req_sonnet_int_001',
      correlationId: 'cost-sess-001:1.2:1',
      message: {
        id: 'msg_sonnet_int_001',
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: 'Integration cost row — Sonnet.' }],
        usage: {
          input_tokens: 0,
          output_tokens: 1_000_000,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
        },
      },
    },
    // Haiku 4.5 (alias) — output=1M → 1M × $5/M = $5.0000.
    {
      type: 'assistant',
      timestamp: '2026-05-07T08:00:10.000Z',
      uuid: 'cost-int-0003',
      sessionId: 'cost-sess-001',
      requestId: 'req_haiku_int_001',
      correlationId: 'cost-sess-001:1.3:1',
      message: {
        id: 'msg_haiku_int_001',
        role: 'assistant',
        model: 'claude-haiku-4-5',
        content: [{ type: 'text', text: 'Integration cost row — Haiku alias.' }],
        usage: {
          input_tokens: 0,
          output_tokens: 1_000_000,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
        },
      },
    },
    // Sidechain subagent — same correlationId as 1.2 parent (R3 task-level
    // groups child rows under parent task bucket).
    {
      type: 'assistant',
      timestamp: '2026-05-07T08:00:15.000Z',
      uuid: 'cost-int-0004',
      sessionId: 'cost-sess-001',
      requestId: 'req_subagent_int_001',
      correlationId: 'cost-sess-001:1.2:1',
      isSidechain: true,
      message: {
        id: 'msg_subagent_int_001',
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: 'Subagent body for integration test.' }],
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
        },
      },
    },
    // Legacy-schema row — NO nested `cache_creation`, only top-level
    // `cache_creation_input_tokens` (FR-PARSER-3 backward compat fallback;
    // cost.ts attributes the legacy bucket entirely to the 5m slot).
    {
      type: 'assistant',
      timestamp: '2026-05-07T08:00:20.000Z',
      uuid: 'cost-int-0005',
      sessionId: 'cost-sess-001',
      requestId: 'req_legacy_int_001',
      correlationId: 'cost-sess-001:1.4:1',
      message: {
        id: 'msg_legacy_int_001',
        role: 'assistant',
        model: 'claude-opus-4-7',
        content: [{ type: 'text', text: 'Legacy schema row — no nested cache_creation.' }],
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    },
    // Sidechain trailer row — user_turn with tool_result carrying a
    // `<usage>...</usage>` block. Same correlationId as the Sonnet parent
    // (1.2:1) so aggregateBy task-level groups it under the parent bucket.
    // extractTrailerUsage emits a UsageRow with model='unknown' (USD=$0)
    // but trailerCount=1 contributes to the parent task bucket.
    // R3 attribution contract (Decision 11 / FR-AGG-2 / FR-AGG-3 /
    // plan.md Validation Hint #3): bucket.totalUSD = parent.usd + trailer.usd.
    {
      type: 'user',
      timestamp: '2026-05-07T08:00:25.000Z',
      uuid: 'cost-int-0006',
      sessionId: 'cost-sess-001',
      correlationId: 'cost-sess-001:1.2:1',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_int_subagent_01',
            content: [
              {
                type: 'text',
                text: 'Subagent finished.\n<usage>total_tokens: 8200\ntool_uses: 14\nduration_ms: 9450</usage>',
              },
            ],
          },
        ],
      },
    },
  ];

  const COST_FIXTURE_DIR = path.join(tmpdir(), 'curdx-flow-integration-cost');
  const COST_FIXTURE_PATH = path.join(COST_FIXTURE_DIR, 'sample-with-usage-int.jsonl');

  beforeAll(() => {
    if (existsSync(COST_FIXTURE_DIR)) rmSync(COST_FIXTURE_DIR, { recursive: true, force: true });
    mkdirSync(COST_FIXTURE_DIR, { recursive: true });
    const body = COST_FIXTURE_ROWS.map((r) => JSON.stringify(r)).join('\n') + '\n';
    writeFileSync(COST_FIXTURE_PATH, body, 'utf8');
  });

  beforeEach(() => {
    if (existsSync(FAKE_HOME)) rmSync(FAKE_HOME, { recursive: true, force: true });
    mkdirSync(path.join(FAKE_HOME, '.claude', 'curdx-flow'), { recursive: true });
  });

  afterAll(() => {
    if (existsSync(COST_FIXTURE_DIR)) rmSync(COST_FIXTURE_DIR, { recursive: true, force: true });
    if (existsSync(FAKE_HOME)) rmSync(FAKE_HOME, { recursive: true, force: true });
  });

  it('emits costBreakdown + totalCost mirror and preserves the 7 flat sections', async () => {
    const previousFixtureEnv = process.env.CURDX_TRANSCRIPT_FIXTURE;
    process.env.CURDX_TRANSCRIPT_FIXTURE = COST_FIXTURE_PATH;
    try {
      const out = await captureStdout(() =>
        runAnalyze({ json: true, costSummary: true, byTask: true } as Parameters<typeof runAnalyze>[0]),
      );
      const parsed = JSON.parse(out) as Record<string, unknown>;

      // 7 flat sections must still surface (NFR-6). Names match report.ts
      // ReportJson keys: hookFailures / slashCommands / subagents / specFunnel
      // / hookDuration / schemaDrift / parentChain.
      const SEVEN_FLAT_KEYS = [
        'hookFailures',
        'slashCommands',
        'subagents',
        'specFunnel',
        'hookDuration',
        'schemaDrift',
        'parentChain',
      ];
      for (const k of SEVEN_FLAT_KEYS) {
        expect(parsed).toHaveProperty(k);
      }

      // costBreakdown sub-keys are arrays (R1/R2/R3/R7).
      const cb = parsed.costBreakdown as Record<string, unknown>;
      expect(cb).toBeDefined();
      expect(Array.isArray(cb.R1_perSpec)).toBe(true);
      expect(Array.isArray(cb.R2_perPhase)).toBe(true);
      expect(Array.isArray(cb.R3_perTask)).toBe(true);
      expect(Array.isArray(cb.R7_topN)).toBe(true);

      // Top-level totalCost.usd mirror is a positive number (FR-REPORT-2 /
      // Decision 3 / Validation Hint). Fixture math: Opus $5 + Sonnet $15
      // + Haiku $5 = $25.0000 (legacy + sidechain rows contribute $0).
      const topTotal = (parsed.totalCost as { usd: unknown }).usd;
      expect(typeof topTotal).toBe('number');
      expect(topTotal).toBeGreaterThan(0);

      // costBreakdown.totalCost.usd === top-level totalCost.usd (mirror).
      const cbTotal = (cb.totalCost as { usd: unknown }).usd;
      expect(cbTotal).toBe(topTotal);
    } finally {
      if (previousFixtureEnv === undefined) {
        delete process.env.CURDX_TRANSCRIPT_FIXTURE;
      } else {
        process.env.CURDX_TRANSCRIPT_FIXTURE = previousFixtureEnv;
      }
    }
  }, 30_000);

  it('legacy-schema row round-trips through filterEvents → extractUsageRowsFromEvents without throwing (FR-PARSER-3 / US-11)', () => {
    // Legacy row mirrors the COST_FIXTURE_ROWS legacy entry above (and the
    // last row of /tests/analyze/fixtures/sample-with-usage.jsonl): no
    // nested `cache_creation`, only top-level `cache_creation_input_tokens`.
    const legacyEvent: Event = {
      kind: 'assistant_turn',
      ts: '2026-05-07T08:00:20.000Z',
      uuid: 'cost-int-legacy',
      requestId: 'req_legacy_round_trip',
      payload: {
        type: 'assistant',
        timestamp: '2026-05-07T08:00:20.000Z',
        uuid: 'cost-int-legacy',
        requestId: 'req_legacy_round_trip',
        correlationId: 'cost-sess-001:1.4:1',
        message: {
          id: 'msg_legacy_round_trip',
          role: 'assistant',
          model: 'claude-opus-4-7',
          content: [{ type: 'text', text: 'Legacy schema row.' }],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 200,
            cache_creation_input_tokens: 300,
            // No nested `cache_creation` on purpose — FR-PARSER-3 fallback.
          },
        },
      } as Record<string, unknown>,
    };

    // filterEvents must accept the row (dedup uses uuid|requestId composite).
    const filtered = filterEvents([legacyEvent], { limit: 10 });
    expect(filtered.length).toBe(1);

    // extractUsageRowsFromEvents must NOT throw on the legacy shape.
    let rows: ReturnType<typeof extractUsageRowsFromEvents> = [];
    expect(() => {
      rows = extractUsageRowsFromEvents(filtered, []);
    }).not.toThrow();

    // It should yield exactly 1 row, model resolved, and the legacy
    // top-level cache_creation_input_tokens=300 must have fallen back to
    // the 5m slot (cost.ts L300-305 fallback).
    expect(rows.length).toBe(1);
    expect(rows[0]?.model).toBe('claude-opus-4-7');
    expect(rows[0]?.cacheCreate5mTokens).toBe(300);
    expect(rows[0]?.cacheCreate1hTokens).toBe(0);
  });

  it('R3 per-task: parent + trailer cost = bucket.totalUSD (FR-AGG-2 / FR-AGG-3 / Decision 11 / plan.md Validation Hint #3) — trailer attribution', async () => {
    // Fixture has 1 trailer row (user_turn tool_result `<usage>`) sharing
    // correlationId `cost-sess-001:1.2:1` with the Sonnet parent assistant
    // row. aggregateBy task-level must:
    //   • group parent + sidechain + trailer under the same bucket key
    //   • emit trailerCount === 1 (sidechain assistant rows carry source
    //     `'assistant'`, not `'subagent_trailer'` — only `<usage>`-derived
    //     rows bump trailerCount)
    //   • bucket.totalUSD === parent.assistant.usd + trailer.usd
    //     (trailer.usd === 0 because extractTrailerUsage sets model='unknown'
    //      → computeCost floors to $0; sidechain Sonnet row also $0 because
    //      its tokens are all 0)
    const previousFixtureEnv = process.env.CURDX_TRANSCRIPT_FIXTURE;
    process.env.CURDX_TRANSCRIPT_FIXTURE = COST_FIXTURE_PATH;
    try {
      // includePrompts: true is required so redact.ts's user_turn content
      // stub-out (privacy pass) doesn't strip the `<usage>...</usage>`
      // tool_result text before extractUsageRowsFromEvents runs the trailer
      // scan. Production path: operators opt into trailer-rich analytics
      // via `--include-prompts` (already wired through runAnalyze options).
      const out = await captureStdout(() =>
        runAnalyze({
          json: true,
          costSummary: true,
          byTask: true,
          includePrompts: true,
        } as Parameters<typeof runAnalyze>[0]),
      );
      const parsed = JSON.parse(out) as Record<string, unknown>;
      const cb = parsed.costBreakdown as Record<string, unknown>;
      const r3 = cb.R3_perTask as Array<{
        key: string;
        totalUSD: number;
        trailerCount: number;
        rowCount: number;
      }>;

      // Locate the Sonnet parent task bucket — its key === correlationId
      // (cost.ts L430: task-level uses raw correlationId as bucket key).
      const TRAILER_TASK_KEY = 'cost-sess-001:1.2:1';
      const trailerBucket = r3.find((b) => b.key === TRAILER_TASK_KEY);
      expect(trailerBucket).toBeDefined();
      if (!trailerBucket) throw new Error('trailer bucket not found');

      // trailerCount === 1: only the user_turn `<usage>` row contributes
      // (the sidechain assistant row is source='assistant' — Decision 11).
      expect(trailerBucket.trailerCount).toBe(1);

      // Fixture math:
      //   parent.assistant.usd = Sonnet 1M output × $15/M = $15.0000
      //   trailer.usd          = model='unknown' → $0
      //   sidechain.assistant.usd = Sonnet with all-zero tokens = $0
      //   bucket.totalUSD      = $15 + $0 + $0 = $15
      // Decision 11 contract: parent + trailer attribution sums to bucket.
      const PARENT_USD = 15.0;
      const TRAILER_USD = 0; // model='unknown' floor
      const expectedTotal = PARENT_USD + TRAILER_USD;
      // 4-decimal precision floor (NFR-3 ±0.001 USD; Decision 10 round-on-emit).
      expect(Math.abs(trailerBucket.totalUSD - expectedTotal)).toBeLessThan(0.001);

      // rowCount must include parent + sidechain + trailer = 3 rows
      // (proves aggregateBy did NOT dedupe across source discriminator).
      expect(trailerBucket.rowCount).toBe(3);
    } finally {
      if (previousFixtureEnv === undefined) {
        delete process.env.CURDX_TRANSCRIPT_FIXTURE;
      } else {
        process.env.CURDX_TRANSCRIPT_FIXTURE = previousFixtureEnv;
      }
    }
  }, 30_000);
});

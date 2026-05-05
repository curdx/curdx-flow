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

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { parseTranscript } from '../../src/analyze/parser.ts';
import type { Counters } from '../../src/analyze/types.ts';

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
  beforeEach(() => {
    resetFakeHome();
  });

  afterAll(() => {
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

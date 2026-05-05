// Unit tests for src/analyze/report.ts (Phase 3 Task 3.2).
//
// Coverage:
//   1. Snapshot the assembled markdown for fixture inputs (covers all 7 sections).
//   2. JSON shape — assert all 7 keys present and well-typed.
//   3. AC-1.2 fuzzy join: jsonl `hook_invocation.exitCode!==0` + errors.jsonl
//      with same hook + ts within ±2s + same cwd → dedup to 1 row, marked merged.
//   4. AC-1.2 negative: different hook OR ts > 2s → no dedup, 2 rows.

import { describe, it, expect } from 'vitest';

import {
  renderReport,
  type ErrorLogEntry,
  type RenderOptions,
  type SpecStateInfo,
} from '../../src/analyze/report.ts';
import type { Event } from '../../src/analyze/types.ts';

const HOOK_BASE = '2026-05-05T01:54:00.000Z';
const HOOK_BASE_MS = Date.parse(HOOK_BASE);

function isoOffset(ms: number): string {
  return new Date(HOOK_BASE_MS + ms).toISOString();
}

function makeHookFailure(
  hookName: string,
  ts: string,
  exitCode: number,
  opts: { stderr?: string; durationMs?: number; uuid?: string; cwd?: string } = {},
): Event {
  return {
    kind: 'hook_invocation',
    ts,
    uuid: opts.uuid ?? `uuid-${hookName}-${ts}`,
    cwd: opts.cwd,
    payload: {
      type: 'attachment',
      attachment: {
        type: 'hook_success',
        hookName,
        exitCode,
        stderr: opts.stderr ?? '',
        ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
      },
    },
  } as Event;
}

function makeAssistantTurn(skill: string, ts: string, uuid = `assistant-${skill}-${ts}`): Event {
  return {
    kind: 'assistant_turn',
    ts,
    uuid,
    payload: {
      type: 'assistant',
      attributionSkill: skill,
      message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    },
  } as Event;
}

function makeUserTurnWithCommand(commandName: string, ts: string): Event {
  return {
    kind: 'user_turn',
    ts,
    uuid: `user-${commandName}-${ts}`,
    payload: {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `<command-name>${commandName}</command-name>`,
          },
        ],
      },
    },
  } as Event;
}

function makeAgentDispatch(subagent: string, ts: string): Event {
  return {
    kind: 'assistant_turn',
    ts,
    uuid: `agent-${subagent}-${ts}`,
    payload: {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'Task',
            input: { subagent_type: subagent, prompt: 'go' },
          },
        ],
      },
    },
  } as Event;
}

const FIXTURE_EVENTS: Event[] = [
  makeHookFailure('quick-mode-guard', isoOffset(0), 1, {
    stderr: 'invalid stdin JSON',
    durationMs: 12,
  }),
  makeHookFailure('update-spec-index', isoOffset(1000), 1, {
    stderr: 'EACCES: permission denied',
    durationMs: 30,
  }),
  // Successful hooks for duration percentile testing (samples=1 each → 样本不足).
  {
    kind: 'hook_invocation',
    ts: isoOffset(2000),
    uuid: 'ok-1',
    payload: {
      type: 'attachment',
      attachment: {
        type: 'hook_success',
        hookName: 'load-spec-context',
        exitCode: 0,
        stderr: '',
        durationMs: 15,
      },
    },
  } as Event,
  makeAssistantTurn('spec-workflow', isoOffset(3000)),
  makeUserTurnWithCommand('/curdx-flow:research', isoOffset(4000)),
  makeAgentDispatch('Explore', isoOffset(5000)),
];

const FIXTURE_ERRORS: ErrorLogEntry[] = [
  {
    ts: isoOffset(50),
    hook: 'stop-watcher',
    event: 'corrupt-state',
    msg: 'BlockDecision triggered',
  },
];

const FIXTURE_SPECS: SpecStateInfo[] = [
  { name: 'plugin-observability', phase: 'execution' },
  { name: 'state-completion-marker', phase: 'execution' },
  { name: 'cross-platform-support', phase: 'done' },
];

const RENDER_OPTS: RenderOptions = {
  limit: 10,
  schemaDrift: { unknownTypeCount: 2, parseErrorCount: 1 },
};

describe('renderReport', () => {
  it('case 1: snapshot the markdown — all 7 section headers must appear', () => {
    const { markdown } = renderReport(FIXTURE_EVENTS, FIXTURE_ERRORS, FIXTURE_SPECS, RENDER_OPTS);

    // Section header presence — explicit assert before snapshot for failure clarity.
    const expectedHeaders = [
      '## Hook Failures',
      '## Slash Commands',
      '## Subagents',
      '## Spec Funnel',
      '## Hook Duration',
      '## Schema Drift',
      '## Parent Chain',
    ];
    for (const h of expectedHeaders) {
      expect(markdown).toContain(h);
    }

    expect(markdown).toMatchSnapshot();
  });

  it('case 2: --json shape exposes all 7 keys with sensible types', () => {
    const { json } = renderReport(FIXTURE_EVENTS, FIXTURE_ERRORS, FIXTURE_SPECS, RENDER_OPTS);

    expect(json).toHaveProperty('hookFailures');
    expect(json).toHaveProperty('slashCommands');
    expect(json).toHaveProperty('subagents');
    expect(json).toHaveProperty('specFunnel');
    expect(json).toHaveProperty('hookDuration');
    expect(json).toHaveProperty('schemaDrift');
    expect(json).toHaveProperty('parentChain');

    expect(Array.isArray(json.hookFailures)).toBe(true);
    expect(Array.isArray(json.slashCommands)).toBe(true);
    expect(Array.isArray(json.subagents)).toBe(true);
    expect(Array.isArray(json.specFunnel)).toBe(true);
    expect(Array.isArray(json.hookDuration)).toBe(true);
    expect(json.schemaDrift).toEqual({ unknownTypeCount: 2, parseErrorCount: 1 });
    expect(typeof json.parentChain.totalEvents).toBe('number');
  });

  it('case 3: AC-1.2 fuzzy join — same hook + ts ±2s + cwd → dedup to 1 merged row', () => {
    const cwd = '/Users/wdx/opc/curdx-flow';
    const events: Event[] = [
      makeHookFailure('foo', isoOffset(0), 1, {
        stderr: 'thrown from jsonl',
        durationMs: 10,
        cwd,
      }),
    ];
    const errors: ErrorLogEntry[] = [
      // Within ±2s window of the jsonl hit, same hook, same cwd → must merge.
      { ts: isoOffset(1500), hook: 'foo', event: 'uncaught', msg: 'errors.jsonl side', cwd },
    ];

    const { json } = renderReport(events, errors, [], RENDER_OPTS);
    expect(json.hookFailures).toHaveLength(1);
    expect(json.hookFailures[0]!.hook).toBe('foo');
    expect(json.hookFailures[0]!.count).toBe(1);
    expect(json.hookFailures[0]!.source).toBe('merged');
  });

  it('case 4: no fuzzy match (different hook) → 2 separate rows', () => {
    const cwd = '/Users/wdx/opc/curdx-flow';
    const events: Event[] = [
      makeHookFailure('foo', isoOffset(0), 1, { cwd }),
    ];
    const errors: ErrorLogEntry[] = [
      { ts: isoOffset(500), hook: 'bar', event: 'x', msg: 'different hook', cwd },
    ];

    const { json } = renderReport(events, errors, [], RENDER_OPTS);
    expect(json.hookFailures).toHaveLength(2);
    const hooks = json.hookFailures.map((r) => r.hook).sort();
    expect(hooks).toEqual(['bar', 'foo']);
    // Each row sourced solely from its origin — no merge.
    const fooRow = json.hookFailures.find((r) => r.hook === 'foo')!;
    const barRow = json.hookFailures.find((r) => r.hook === 'bar')!;
    expect(fooRow.source).toBe('jsonl');
    expect(barRow.source).toBe('errors.jsonl');
  });

  it('case 4b: same hook but ts > 2s apart → no dedup, 2 rows under same hook (count=2 merged)', () => {
    // When ts windows DON'T overlap, the buckets stay separate but the rollup
    // still groups by hook name → same hook gets count=2 with source 'merged'
    // (because two distinct origins contributed). This is "no fuzzy join"
    // — they're not the SAME failure, just two failures of the same hook.
    const cwd = '/Users/wdx/opc/curdx-flow';
    const events: Event[] = [
      makeHookFailure('foo', isoOffset(0), 1, { cwd }),
    ];
    const errors: ErrorLogEntry[] = [
      // 5 seconds later — outside the ±2s window.
      { ts: isoOffset(5000), hook: 'foo', event: 'x', msg: 'late', cwd },
    ];

    const { json } = renderReport(events, errors, [], RENDER_OPTS);
    // Expect exactly 1 row (grouped by hook) but count=2 (no fuzzy dedup).
    expect(json.hookFailures).toHaveLength(1);
    expect(json.hookFailures[0]!.hook).toBe('foo');
    expect(json.hookFailures[0]!.count).toBe(2);
    expect(json.hookFailures[0]!.source).toBe('merged');
  });
});

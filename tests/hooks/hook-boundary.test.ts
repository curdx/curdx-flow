import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const workspaces: string[] = [];
const hookRoot = join(process.cwd(), 'plugins/curdx-flow/hooks/scripts');

interface HookRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
}

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'curdx-hook-boundary-'));
  workspaces.push(workspace);
  return workspace;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

async function runHookScript(scriptName: string, stdin: string | Record<string, unknown>): Promise<HookRunResult> {
  const scriptPath = join(hookRoot, scriptName);
  expect(existsSync(scriptPath), `${scriptName} should be built before hook tests run`).toBe(true);
  const hookHome = await createWorkspace();

  const child = spawn(process.execPath, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOME: hookHome,
      USERPROFILE: hookHome,
    },
  });
  const startedAt = Date.now();
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

  const raw = typeof stdin === 'string' ? stdin : JSON.stringify(stdin);
  child.stdin.end(raw);

  const result = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${scriptName} timed out`));
    }, 5_000);
    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout);
      resolve({ exitCode, signal });
    });
  });

  return {
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
    exitCode: result.exitCode,
    signal: result.signal,
    durationMs: Date.now() - startedAt,
  };
}

async function createLegacySpecWorkspace(state: Record<string, unknown>): Promise<string> {
  const workspace = await createWorkspace();
  const specDir = join(workspace, 'specs/story-1-6');
  await mkdir(specDir, { recursive: true });
  await writeFile(join(workspace, 'specs/.current-spec'), 'story-1-6\n', 'utf8');
  const statePath = join(specDir, '.curdx-state.json');
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  const old = new Date(Date.now() - 3_000);
  await utimes(statePath, old, old);
  await writeFile(join(specDir, 'tasks.md'), '- [ ] first task\n- [ ] second task\n', 'utf8');
  await writeFile(join(specDir, 'transcript.jsonl'), '{"message":"still running"}\n', 'utf8');
  return workspace;
}

describe('Claude Code hook boundary behavior', () => {
  it('fails open on malformed stdin without debug text on stdout', async () => {
    const scripts = [
      'stop-watcher.mjs',
      'task-completed-verifier.mjs',
      'post-tool-batch-snapshot.mjs',
      'post-compact-recorder.mjs',
      'stop-failure-handler.mjs',
    ];

    for (const script of scripts) {
      const result = await runHookScript(script, '{not-json');

      expect(result.exitCode, script).toBe(0);
      expect(result.signal, script).toBeNull();
      expect(result.durationMs, script).toBeLessThan(5_000);
      expect(result.stdout, script).not.toMatch(/invalid stdin|SyntaxError|stack|debug/i);
      if (result.stdout.trim().length > 0) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    }
  });

  it('lets Stop finish an in-progress native goal turn without continuation prompts', async () => {
    const workspace = await createLegacySpecWorkspace({
      phase: 'execution',
      taskIndex: 0,
      totalTasks: 2,
      completed: false,
      executionDriver: 'goal',
      verificationBlocks: {},
      runId: 'run-1',
      goalId: 'goal-1',
    });

    const result = await runHookScript('stop-watcher.mjs', {
      hook_event_name: 'Stop',
      cwd: workspace,
      session_id: 'session-1',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('native /goal');
    expect(result.stdout).not.toMatch(/continue|continuation|planner|Playwright|dev server|MCP/i);
  });

  it('lets Stop finish an unfinished manual fallback turn without continuation prompts', async () => {
    const workspace = await createLegacySpecWorkspace({
      phase: 'execution',
      taskIndex: 0,
      totalTasks: 2,
      completed: false,
      executionDriver: 'manual',
      verificationBlocks: {},
      runId: 'run-manual',
      goalId: 'goal-manual',
    });

    const result = await runHookScript('stop-watcher.mjs', {
      hook_event_name: 'Stop',
      cwd: workspace,
      session_id: 'session-1',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('/curdx-flow:implement');
    expect(result.stdout).not.toMatch(/continue|continuation|planner|Playwright|dev server|MCP/i);
  });

  it('blocks Stop only on deterministic completion gates, not continuation prompts', async () => {
    const workspace = await createLegacySpecWorkspace({
      phase: 'execution',
      taskIndex: 1,
      totalTasks: 1,
      completed: false,
      verificationBlocks: {},
      runId: 'run-stop',
      goalId: 'goal-stop',
    });
    const transcriptPath = join(workspace, 'specs/story-1-6/transcript.jsonl');
    await writeFile(transcriptPath, '{"message":"ALL_TASKS_COMPLETE"}\n', 'utf8');

    const result = await runHookScript('stop-watcher.mjs', {
      hook_event_name: 'Stop',
      cwd: workspace,
      session_id: 'session-1',
      transcript_path: transcriptPath,
      futureField: { ignored: true },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      decision: 'block',
      systemMessage: "curdx-flow: phase 'execution' missing verification block (spec: story-1-6)",
    });
    expect(String(parsed.reason)).toContain('verification block');
    expect(result.stdout).not.toMatch(/continuation prompt|planner|Playwright|dev server|MCP/i);
  });

  it('short-circuits Stop re-entry through stop_hook_active', async () => {
    const workspace = await createLegacySpecWorkspace({
      phase: 'execution',
      taskIndex: 0,
      totalTasks: 2,
      completed: false,
      verificationBlocks: {},
    });

    const result = await runHookScript('stop-watcher.mjs', {
      hook_event_name: 'Stop',
      cwd: workspace,
      stop_hook_active: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('blocks TaskCompleted on missing verification evidence with run and goal identity', async () => {
    const workspace = await createLegacySpecWorkspace({
      phase: 'execution',
      taskIndex: 0,
      totalTasks: 1,
      completed: false,
      verificationBlocks: {},
      runId: 'run-1',
      goalId: 'goal-1',
    });

    const result = await runHookScript('task-completed-verifier.mjs', {
      hook_event_name: 'TaskCompleted',
      cwd: workspace,
      session_id: 'session-1',
      task_id: 'task-1',
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('missing verification block');
    expect(result.stderr).toContain('run-1');
    expect(result.stderr).toContain('goal-1');
    expect(result.stderr).toMatch(/run|rerun|re-run|next action/i);
  });

  it('blocks TaskCompleted on failed and stale verification blocks with actionable identity', async () => {
    const failedWorkspace = await createLegacySpecWorkspace({
      phase: 'execution',
      taskIndex: 0,
      totalTasks: 1,
      completed: false,
      runId: 'run-failed',
      goalId: 'goal-failed',
      verificationBlocks: {
        execution: {
          command: 'npm run verify',
          exitCode: 1,
          timestamp: '2026-05-17T01:00:00.000Z',
          srcMtime: 0,
          failedReason: 'tests failed',
        },
      },
    });

    const failed = await runHookScript('task-completed-verifier.mjs', {
      hook_event_name: 'TaskCompleted',
      cwd: failedWorkspace,
      session_id: 'session-1',
      task_id: 'task-1',
    });

    expect(failed.exitCode).toBe(2);
    expect(failed.stderr).toContain('tests failed');
    expect(failed.stderr).toContain('run-failed');
    expect(failed.stderr).toContain('goal-failed');
    expect(failed.stderr).toContain('npm run verify');

    const staleWorkspace = await createLegacySpecWorkspace({
      phase: 'execution',
      taskIndex: 1,
      totalTasks: 2,
      completed: false,
      runId: 'run-stale',
      goalId: 'goal-stale',
      verificationBlocks: {
        execution: {
          command: 'npm run test:hooks',
          exitCode: 0,
          timestamp: '2026-05-17T01:00:00.000Z',
          srcMtime: 0,
          taskIndex: 0,
        },
      },
    });

    const stale = await runHookScript('task-completed-verifier.mjs', {
      hook_event_name: 'TaskCompleted',
      cwd: staleWorkspace,
      session_id: 'session-1',
      task_id: 'task-2',
    });

    expect(stale.exitCode).toBe(2);
    expect(stale.stderr).toContain('task index 0');
    expect(stale.stderr).toContain('current task index is 1');
    expect(stale.stderr).toContain('run-stale');
    expect(stale.stderr).toContain('goal-stale');
  });

  it('blocks TaskCompleted when source is edited after the verification block', async () => {
    const editedWorkspace = await createLegacySpecWorkspace({
      phase: 'execution',
      taskIndex: 0,
      totalTasks: 1,
      completed: false,
      runId: 'run-edited',
      goalId: 'goal-edited',
      verificationBlocks: {
        execution: {
          command: 'npm run verify',
          exitCode: 0,
          timestamp: '2026-05-17T01:00:00.000Z',
          srcMtime: 0,
          taskIndex: 0,
        },
      },
      lastSrcEditMs: Date.parse('2026-05-17T01:00:00.000Z') + 60_000,
    });

    const edited = await runHookScript('task-completed-verifier.mjs', {
      hook_event_name: 'TaskCompleted',
      cwd: editedWorkspace,
      session_id: 'session-1',
      task_id: 'task-1',
    });

    expect(edited.exitCode).toBe(2);
    expect(edited.stderr).toContain('src edited');
    expect(edited.stderr).toContain('run-edited');
  });

  it('fails open for TaskCompleted missing task_id and malformed legacy state', async () => {
    const noTaskId = await runHookScript('task-completed-verifier.mjs', {
      hook_event_name: 'TaskCompleted',
      cwd: await createWorkspace(),
      session_id: 'session-1',
    });

    expect(noTaskId.exitCode).toBe(0);
    expect(() => JSON.parse(noTaskId.stdout)).not.toThrow();

    const workspace = await createWorkspace();
    const specDir = join(workspace, 'specs/story-1-6');
    await mkdir(specDir, { recursive: true });
    await writeFile(join(workspace, 'specs/.current-spec'), 'story-1-6\n', 'utf8');
    await writeFile(join(specDir, '.curdx-state.json'), '{not-json\n', 'utf8');

    const malformedState = await runHookScript('task-completed-verifier.mjs', {
      hook_event_name: 'TaskCompleted',
      cwd: workspace,
      session_id: 'session-1',
      task_id: 'task-1',
    });

    expect(malformedState.exitCode).toBe(0);
    expect(() => JSON.parse(malformedState.stdout)).not.toThrow();
  });

  it('fails open for unknown future fields, missing old fields, and helper exceptions', async () => {
    const missingFieldCases: Array<{
      script: string;
      payload: Record<string, unknown>;
      stdout?: 'empty' | 'json';
    }> = [
      {
        script: 'stop-watcher.mjs',
        payload: { hook_event_name: 'Stop', futureField: { ignored: true } },
        stdout: 'empty',
      },
      {
        script: 'task-completed-verifier.mjs',
        payload: {
          hook_event_name: 'TaskCompleted',
          cwd: await createWorkspace(),
          session_id: 'session-1',
          futureField: { ignored: true },
        },
        stdout: 'json',
      },
      {
        script: 'post-tool-batch-snapshot.mjs',
        payload: {
          hook_event_name: 'PostToolBatch',
          cwd: await createWorkspace(),
          session_id: 'session-1',
          futureField: { ignored: true },
        },
        stdout: 'empty',
      },
      {
        script: 'post-compact-recorder.mjs',
        payload: {
          hook_event_name: 'PostCompact',
          futureField: { ignored: true },
          compact_summary: 'summary without cwd',
        },
        stdout: 'empty',
      },
      {
        script: 'stop-failure-handler.mjs',
        payload: { hook_event_name: 'StopFailure', futureField: { ignored: true } },
        stdout: 'empty',
      },
    ];

    for (const item of missingFieldCases) {
      const result = await runHookScript(item.script, item.payload);
      expect(result.exitCode, item.script).toBe(0);
      expect(result.signal, item.script).toBeNull();
      expect(result.durationMs, item.script).toBeLessThan(5_000);
      if (item.stdout === 'json') {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      } else {
        expect(result.stdout, item.script).toBe('');
      }
      expect(result.stdout, item.script).not.toMatch(/debug|SyntaxError|RangeError|at .*\.mjs:\d+/i);
    }

    const workspace = await createWorkspace();
    const specDir = join(workspace, 'specs/story-1-6');
    await mkdir(specDir, { recursive: true });
    await writeFile(join(workspace, 'specs/.current-spec'), 'story-1-6\n', 'utf8');
    await writeFile(
      join(specDir, '.curdx-state.json'),
      '{"phase":"execution","taskIndex":0,"totalTasks":1,"verificationBlocks":{"execution":{"command":"npm run test:hooks","exitCode":0,"timestamp":"2026-05-17T01:00:00.000Z","srcMtime":1e309}}}\n',
      'utf8',
    );

    const helperException = await runHookScript('task-completed-verifier.mjs', {
      hook_event_name: 'TaskCompleted',
      cwd: workspace,
      session_id: 'session-1',
      task_id: 'task-1',
    });

    expect(helperException.exitCode).toBe(0);
    expect(JSON.parse(helperException.stdout)).toMatchObject({ continue: true });
    expect(helperException.stderr).toContain('failing open');
    expect(helperException.stdout).not.toMatch(/RangeError|internal error|stack|debug/i);
  });

  it('keeps PostToolBatch advisory output as event-specific JSON', async () => {
    const workspace = await createWorkspace();
    const result = await runHookScript('post-tool-batch-snapshot.mjs', {
      hook_event_name: 'PostToolBatch',
      cwd: workspace,
      session_id: 'session-1',
      tool_calls: [{ tool_name: 'Read' }],
      futureField: { kept: true },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('');

    const advisory = await runHookScript('post-tool-batch-snapshot.mjs', {
      hook_event_name: 'PostToolBatch',
      cwd: workspace,
      session_id: 'session-1',
      tool_calls: [{ tool_name: 'Edit' }],
    });
    expect(advisory.exitCode).toBe(0);
    expect(advisory.stderr).toBe('');
    const parsed = JSON.parse(advisory.stdout) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      hookSpecificOutput: {
        hookEventName: 'PostToolBatch',
      },
    });
    expect(advisory.stdout).not.toMatch(/debug|SyntaxError|at .*\.mjs:\d+/i);
  });
});

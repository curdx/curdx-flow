// Unit tests for src/analyze/redact.ts (Phase 3 Task 3.1).
//
// Privacy guardrails:
//   1. Default redaction strips user-turn prompt body but preserves
//      commandHints (slash-command names extracted from <command-name> XML).
//   2. includePrompts:true is verbatim passthrough.
//   3. file-history-snapshot events are dropped regardless.
//   4. Path-bearing fields are normalised to <basename>@<sha256[0..8]>.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

import { redactEvent, hashProject } from '../../src/analyze/redact.ts';
import type { Event } from '../../src/analyze/types.ts';

function makeUserTurnWithCommand(commandText: string): Event {
  return {
    kind: 'user_turn',
    ts: '2026-05-05T00:00:00.000Z',
    uuid: 'u1',
    payload: {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'text',
            text: commandText,
          },
        ],
      },
    },
  } as Event;
}

describe('redact', () => {
  it('case 1: default redaction strips body but commandHints retains /curdx-flow:research', () => {
    const original =
      '<command-name>/curdx-flow:research</command-name>\n<command-args>plugin-observability</command-args>\nLorem ipsum dolor sit amet.';
    const ev = makeUserTurnWithCommand(original);
    const redacted = redactEvent(ev);
    expect(redacted).not.toBeNull();

    // grep guard: the original prompt body must NOT survive in serialised form
    // EXCEPT for the synthesised <command-name> stub.
    const serialised = JSON.stringify(redacted);
    expect(serialised).not.toContain('Lorem ipsum');
    expect(serialised).not.toContain('plugin-observability'); // command-args dropped

    // commandHints must surface the slash-command name.
    const hints = (redacted!.payload as { redacted?: { commandHints?: string[] } }).redacted
      ?.commandHints;
    expect(hints).toContain('/curdx-flow:research');
  });

  it('case 2: includePrompts:true → verbatim passthrough (full text survives)', () => {
    const original =
      '<command-name>/curdx-flow:research</command-name>\nFull prompt body here.';
    const ev = makeUserTurnWithCommand(original);
    const redacted = redactEvent(ev, { includePrompts: true });
    expect(redacted).not.toBeNull();
    const serialised = JSON.stringify(redacted);
    expect(serialised).toContain('/curdx-flow:research');
    expect(serialised).toContain('Full prompt body here.');
  });

  it('case 3: file-history-snapshot events are dropped (return null)', () => {
    const ev: Event = {
      kind: 'unknown',
      ts: '2026-05-05T00:00:00.000Z',
      payload: { type: 'file-history-snapshot', diff: '...' },
    } as Event;
    expect(redactEvent(ev)).toBeNull();
    // Even with includePrompts:true (file-history is never user-facing).
    expect(redactEvent(ev, { includePrompts: true })).toBeNull();
  });

  it('case 3b: attachment.type=file-history-snapshot is also dropped', () => {
    const ev: Event = {
      kind: 'unknown',
      ts: '2026-05-05T00:00:00.000Z',
      payload: {
        type: 'attachment',
        attachment: { type: 'file-history-snapshot', diff: '...' },
      },
    } as Event;
    expect(redactEvent(ev)).toBeNull();
  });

  it('case 4: cwd is reduced to <basename>@<sha256[0..8]>', () => {
    const fullPath = '/Users/foo/projects/bar/baz';
    const ev: Event = {
      kind: 'tool_call',
      ts: '2026-05-05T00:00:00.000Z',
      cwd: fullPath,
      payload: { type: 'tool_use' },
    } as Event;
    const redacted = redactEvent(ev);
    expect(redacted).not.toBeNull();

    const expectedHash = createHash('sha256').update(fullPath).digest('hex').slice(0, 8);
    const expectedCwd = `baz@${expectedHash}`;
    expect(redacted!.cwd).toBe(expectedCwd);

    // hashProject helper agrees with redacted output.
    expect(hashProject(fullPath)).toBe(expectedHash);

    // grep guard: full path must not survive anywhere in the redacted event.
    const serialised = JSON.stringify(redacted);
    expect(serialised).not.toContain('/Users/foo/projects/bar/baz');
  });

  it('case 4b: payload.path is also redacted to basename@hash', () => {
    const ev: Event = {
      kind: 'unknown',
      ts: '2026-05-05T00:00:00.000Z',
      payload: { type: 'attachment', path: '/etc/secret/file.txt' },
    } as Event;
    const redacted = redactEvent(ev);
    expect(redacted).not.toBeNull();
    const redactedPath = (redacted!.payload as { path?: string }).path;
    expect(redactedPath).toMatch(/^file\.txt@[0-9a-f]{8}$/);
    expect(redactedPath).not.toContain('/etc/secret');
  });
});

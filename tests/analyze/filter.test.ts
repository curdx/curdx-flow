// Unit tests for src/analyze/filter.ts (Phase 3 Task 3.1).
//
// Covers D-2 (composite uuid+requestId dedupe), D-3 (uuid-only fallback when
// requestId is absent), --since, --limit, --project (no-op placeholder), and
// empty-input safety.

import { describe, it, expect } from 'vitest';

import { filterEvents } from '../../src/analyze/filter.ts';
import type { Event } from '../../src/analyze/types.ts';

function makeEvent(partial: Partial<Event> & { ts: string }): Event {
  return {
    kind: 'tool_call',
    ts: partial.ts,
    ...(partial.uuid !== undefined ? { uuid: partial.uuid } : {}),
    ...(partial.requestId !== undefined ? { requestId: partial.requestId } : {}),
    ...(partial.cwd !== undefined ? { cwd: partial.cwd } : {}),
    payload: partial.payload ?? {},
  } as Event;
}

describe('filter', () => {
  it('case 1: dedupe by uuid alone (no requestId) — duplicate uuid kept once', () => {
    const events = [
      makeEvent({ uuid: 'u1', ts: '2026-05-05T00:00:00.000Z' }),
      makeEvent({ uuid: 'u1', ts: '2026-05-05T00:00:01.000Z' }),
    ];
    const out = filterEvents(events, {});
    expect(out).toHaveLength(1);
    expect(out[0]?.uuid).toBe('u1');
  });

  it('case 2: composite key — same uuid + different requestId both kept (D-2)', () => {
    const events = [
      makeEvent({ uuid: 'u1', requestId: 'r1', ts: '2026-05-05T00:00:00.000Z' }),
      makeEvent({ uuid: 'u1', requestId: 'r2', ts: '2026-05-05T00:00:01.000Z' }),
    ];
    const out = filterEvents(events, {});
    expect(out).toHaveLength(2);
  });

  it('case 3: --since 7d drops events older than the window', () => {
    const now = Date.now();
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
    const events = [
      makeEvent({ uuid: 'old', ts: eightDaysAgo }),
      makeEvent({ uuid: 'recent', ts: oneDayAgo }),
    ];
    const out = filterEvents(events, { since: '7d' });
    expect(out).toHaveLength(1);
    expect(out[0]?.uuid).toBe('recent');
  });

  it('case 4: --limit 10 truncates to 10 events ordered by ts desc', () => {
    const events: Event[] = [];
    for (let i = 0; i < 15; i++) {
      // Pad ms so ts strings sort lexicographically the same as chronologically.
      const ms = String(i).padStart(3, '0');
      events.push(makeEvent({ uuid: `u${i}`, ts: `2026-05-05T00:00:00.${ms}Z` }));
    }
    const out = filterEvents(events, { limit: 10 });
    expect(out).toHaveLength(10);
    // Most recent first — uuid u14 must be at index 0.
    expect(out[0]?.uuid).toBe('u14');
    expect(out[9]?.uuid).toBe('u5');
  });

  it('case 5: --project is a placeholder — does not affect output (Task 4.1 enables semantics)', () => {
    const events = [
      makeEvent({ uuid: 'a', cwd: '/Users/foo/proj-a', ts: '2026-05-05T00:00:00.000Z' }),
      makeEvent({ uuid: 'b', cwd: '/Users/foo/proj-b', ts: '2026-05-05T00:00:01.000Z' }),
    ];
    const out = filterEvents(events, { project: 'proj-a' });
    expect(out).toHaveLength(2);
  });

  it('case 6: empty input → empty output (no throw)', () => {
    expect(filterEvents([], {})).toEqual([]);
    expect(filterEvents([], { limit: 5, since: '7d', project: 'x' })).toEqual([]);
  });

  it('case 7: requestId fallback (D-3) — same uuid no requestId dedupes to 1', () => {
    const events = [
      makeEvent({ uuid: 'a', ts: '2026-05-05T00:00:00.000Z' }),
      makeEvent({ uuid: 'a', ts: '2026-05-05T00:00:01.000Z' }),
    ];
    expect(() => filterEvents(events, {})).not.toThrow();
    const out = filterEvents(events, {});
    expect(out).toHaveLength(1);
  });

  it('events without uuid pass through (filter is best-effort)', () => {
    const events = [
      makeEvent({ ts: '2026-05-05T00:00:00.000Z' }),
      makeEvent({ ts: '2026-05-05T00:00:01.000Z' }),
    ];
    const out = filterEvents(events, {});
    expect(out).toHaveLength(2);
  });
});

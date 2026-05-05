// Unit tests for src/analyze/parser.ts (Phase 3 Task 3.1).
//
// Coverage:
//   1. Full-file parse → snapshot the Event list (toMatchSnapshot)
//   2. Counter sanity — half-line bumps parse_error, unknown_event_v3 bumps unknown_type
//   3. shouldRotate() — D-1 size-shrink heuristic
//   4. Resume offset — parsing again starting at file size yields zero events

import { describe, it, expect } from 'vitest';
import { statSync } from 'node:fs';
import path from 'node:path';

import {
  getStateForPath,
  parseTranscript,
  shouldRotate,
} from '../../src/analyze/parser.ts';
import type { Counters, Event } from '../../src/analyze/types.ts';

const FIXTURE_PATH = path.join(process.cwd(), 'tests/analyze/fixtures/sample.jsonl');

async function collect(iter: AsyncIterable<Event>): Promise<Event[]> {
  const out: Event[] = [];
  for await (const ev of iter) out.push(ev);
  return out;
}

// Strip the volatile/large `payload` from snapshots — we still assert the
// stable subset (kind, ts, uuid, requestId, cwd) so the snapshot stays
// review-friendly.
function stripPayload(events: Event[]): Array<Omit<Event, 'payload'>> {
  return events.map((ev) => {
    const { payload: _payload, ...rest } = ev;
    return rest;
  });
}

describe('parser', () => {
  it('parses fixture sample.jsonl into a stable Event list', async () => {
    const counters: Counters = { unknown_type: 0, parse_error: 0, processed: 0 };
    const events = await collect(parseTranscript(FIXTURE_PATH, 0, undefined, counters));
    expect(stripPayload(events)).toMatchSnapshot();
  });

  it('counters: parse_error >= 1 (half line) and unknown_type >= 1 (unknown_event_v3)', async () => {
    const counters: Counters = { unknown_type: 0, parse_error: 0, processed: 0 };
    await collect(parseTranscript(FIXTURE_PATH, 0, undefined, counters));
    expect(counters.parse_error).toBeGreaterThanOrEqual(1);
    expect(counters.unknown_type).toBeGreaterThanOrEqual(1);
    expect(counters.processed).toBeGreaterThan(0);
  });

  it('shouldRotate: prev size 999 + current size 100 → true', () => {
    const prev = { byteOffset: 999, lastModifiedMs: 1_700_000_000_000, sizeBytes: 999 };
    const current = { sizeBytes: 100, lastModifiedMs: 1_700_000_001_000 };
    expect(shouldRotate(prev, current)).toBe(true);
  });

  it('shouldRotate: undefined prev → false (first run)', () => {
    expect(shouldRotate(undefined, { sizeBytes: 10, lastModifiedMs: 0 })).toBe(false);
  });

  it('shouldRotate: equal/growing size + monotonic mtime → false (normal append)', () => {
    const prev = { byteOffset: 100, lastModifiedMs: 1_000, sizeBytes: 100 };
    const current = { sizeBytes: 200, lastModifiedMs: 2_000 };
    expect(shouldRotate(prev, current)).toBe(false);
  });

  it('byteOffset terminal state: parsing from end-of-file yields zero events', async () => {
    const fileSize = statSync(FIXTURE_PATH).size;

    // First run: snapshot the offset (acts like a real prior session).
    const state = getStateForPath(FIXTURE_PATH);
    expect(state.byteOffset).toBe(fileSize);
    expect(state.sizeBytes).toBe(fileSize);

    // Second run: resume from that offset — no new bytes ⇒ no events.
    const counters: Counters = { unknown_type: 0, parse_error: 0, processed: 0 };
    const events = await collect(
      parseTranscript(FIXTURE_PATH, state.byteOffset, undefined, counters),
    );
    expect(events).toHaveLength(0);
    expect(counters.processed).toBe(0);
  });
});

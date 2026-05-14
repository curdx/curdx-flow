import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { filterEvents } from '../../src/analyze/filter.ts';
import { loadSchemaMap, parseTranscript } from '../../src/analyze/parser.ts';
import type { Counters, Event } from '../../src/analyze/types.ts';

async function collect(pathname: string, counters: Counters): Promise<Event[]> {
  const events: Event[] = [];
  for await (const event of parseTranscript(pathname, 0, loadSchemaMap(), counters)) {
    events.push(event);
  }
  return events;
}

describe('analyze parser', () => {
  it('streams known transcript rows and counts corrupt or unknown rows', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'curdx-analyze-'));
    const transcript = path.join(dir, 'session.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({ type: 'assistant', timestamp: '2026-05-14T01:00:00Z', uuid: 'a' }),
        JSON.stringify({ type: 'attachment', attachment: { type: 'hook_success' }, timestamp: '2026-05-14T01:01:00Z', uuid: 'h' }),
        '{not-json',
        JSON.stringify({ type: 'future_event', timestamp: '2026-05-14T01:02:00Z', uuid: 'x' }),
      ].join('\n'),
      'utf8',
    );

    const counters: Counters = { unknown_type: 0, parse_error: 0, processed: 0 };
    const events = await collect(transcript, counters);

    expect(events.map((event) => event.kind)).toEqual(['assistant_turn', 'hook_invocation']);
    expect(counters).toMatchObject({ processed: 2, parse_error: 1, unknown_type: 1 });
  });

  it('dedupes by uuid plus request id and returns newest rows first', () => {
    const events: Event[] = [
      { kind: 'assistant_turn', ts: '2026-05-14T01:00:00Z', uuid: 'same', requestId: '1', payload: {} },
      { kind: 'assistant_turn', ts: '2026-05-14T01:01:00Z', uuid: 'same', requestId: '1', payload: {} },
      { kind: 'assistant_turn', ts: '2026-05-14T01:02:00Z', uuid: 'same', requestId: '2', payload: {} },
    ];

    const filtered = filterEvents(events, { limit: 10 });

    expect(filtered.map((event) => `${event.uuid}:${event.requestId}`)).toEqual(['same:2', 'same:1']);
  });
});

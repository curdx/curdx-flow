import { defineCommand } from 'citty';
import { runAnalyze } from '../analyze/index.ts';

export type AnalyzeOptions = {
  out?: string;
  json?: boolean;
  limit?: number;
};

const analyzeCmd = defineCommand({
  meta: {
    name: 'analyze',
    description: 'Analyze Claude Code session jsonl + curdx-flow errors.jsonl into a markdown report',
  },
  args: {
    out: {
      type: 'string' as const,
      description: 'Output file path (default: stdout)',
    },
    json: {
      type: 'boolean' as const,
      description: 'Emit JSON instead of markdown',
    },
    limit: {
      type: 'string' as const,
      description: 'Top-N truncation for tabular sections (default: 10)',
    },
  },
  async run({ args }) {
    const limitRaw = args.limit;
    const limit = typeof limitRaw === 'string' && limitRaw.length > 0 ? Number(limitRaw) : undefined;
    await runAnalyze({
      out: typeof args.out === 'string' ? args.out : undefined,
      json: Boolean(args.json),
      limit: Number.isFinite(limit) ? (limit as number) : undefined,
    });
  },
});

export default analyzeCmd;

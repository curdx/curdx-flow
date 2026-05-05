import { defineCommand } from 'citty';

export type AnalyzeOptions = {
  out?: string;
  json?: boolean;
  limit?: number;
};

// Stub — runAnalyze() is implemented in Task 1.2 (src/analyze/index.ts).
// For Task 1.1 we only register the CLI surface so `analyze --help` resolves.
async function runAnalyze(opts: AnalyzeOptions): Promise<void> {
  const _opts = opts;
  void _opts;
  process.stdout.write(
    'analyze: stub (implementation arrives in Task 1.2)\n',
  );
}

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

import { defineCommand } from 'citty';

export type AnalyzeOptions = {
  out?: string;
  json?: boolean;
  limit?: number;
  includePrompts?: boolean;
  session?: string;
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
    'include-prompts': {
      type: 'boolean' as const,
      description: 'Skip prompt redaction (D-9 white-list passthrough disabled — local debugging only)',
    },
    session: {
      type: 'string' as const,
      description: 'Filter to single session UUID (matches <uuid>.jsonl in encoded project dir)',
    },
  },
  async run({ args }) {
    const limitRaw = args.limit;
    const limit = typeof limitRaw === 'string' && limitRaw.length > 0 ? Number(limitRaw) : undefined;
    const { runAnalyze } = await import('../analyze/index.ts');
    await runAnalyze({
      out: typeof args.out === 'string' ? args.out : undefined,
      json: Boolean(args.json),
      limit: Number.isFinite(limit) ? (limit as number) : undefined,
      includePrompts: Boolean((args as Record<string, unknown>)['include-prompts']),
      session: typeof args.session === 'string' && args.session.length > 0 ? args.session : undefined,
    });
  },
});

export default analyzeCmd;

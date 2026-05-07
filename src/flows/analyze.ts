import { defineCommand } from 'citty';

export type AnalyzeOptions = {
  out?: string;
  json?: boolean;
  limit?: number;
  includePrompts?: boolean;
  session?: string;
  costSummary?: boolean;
  bySpec?: boolean;
  byPhase?: boolean;
  byTask?: boolean;
  top?: number;
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
    'cost-summary': {
      type: 'boolean' as const,
      description: 'Emit OB-3 cost analytics: totalCost.usd top-level + ## Cost Summary markdown (opt-in, default false)',
    },
    'by-spec': {
      type: 'boolean' as const,
      description: 'OB-3 R1: aggregate cost by spec dimension (opt-in, default false; with --cost-summary alone all 3 dims emit)',
    },
    'by-phase': {
      type: 'boolean' as const,
      description: 'OB-3 R2: aggregate cost by phase dimension (opt-in, default false; with --cost-summary alone all 3 dims emit)',
    },
    'by-task': {
      type: 'boolean' as const,
      description: 'OB-3 R7: aggregate cost by task (correlationId) dimension, top-N truncated by --top (opt-in, default false)',
    },
    top: {
      type: 'string' as const,
      description: 'OB-3 R7 top-N truncation for --by-task buckets (default: 10)',
    },
  },
  async run({ args }) {
    const limitRaw = args.limit;
    const limit = typeof limitRaw === 'string' && limitRaw.length > 0 ? Number(limitRaw) : undefined;
    const topRaw = (args as Record<string, unknown>).top;
    const top = typeof topRaw === 'string' && topRaw.length > 0 ? Number(topRaw) : undefined;
    const { runAnalyze } = await import('../analyze/index.ts');
    await runAnalyze({
      out: typeof args.out === 'string' ? args.out : undefined,
      json: Boolean(args.json),
      limit: Number.isFinite(limit) ? (limit as number) : undefined,
      includePrompts: Boolean((args as Record<string, unknown>)['include-prompts']),
      session: typeof args.session === 'string' && args.session.length > 0 ? args.session : undefined,
      costSummary: Boolean((args as Record<string, unknown>)['cost-summary']),
      bySpec: Boolean((args as Record<string, unknown>)['by-spec']),
      byPhase: Boolean((args as Record<string, unknown>)['by-phase']),
      byTask: Boolean((args as Record<string, unknown>)['by-task']),
      top: Number.isFinite(top) ? (top as number) : undefined,
    });
  },
});

export default analyzeCmd;

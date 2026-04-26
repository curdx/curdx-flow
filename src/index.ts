import * as p from '@clack/prompts';
import { defineCommand, runMain } from 'citty';
import { initLanguage } from './ui/language.ts';
import { mainMenu } from './ui/menu.ts';
import { installFlow } from './flows/install.ts';
import { uninstallFlow } from './flows/uninstall.ts';
import { updateFlow } from './flows/update.ts';
import { statusFlow } from './flows/status.ts';
import { t, type Lang } from './i18n/index.ts';

function parseLang(v: unknown): Lang | undefined {
  return v === 'zh' || v === 'en' ? v : undefined;
}

const sharedArgs = {
  lang: { type: 'string' as const, description: 'Override language: zh or en' },
};

const installCmd = defineCommand({
  meta: { name: 'install', description: 'Install or reinstall plugins / MCP servers' },
  args: {
    ...sharedArgs,
    all: { type: 'boolean' as const, description: 'Install all known items' },
    yes: { type: 'boolean' as const, description: 'Skip reinstall confirmation (assume yes)' },
    ids: { type: 'positional' as const, required: false, description: 'Item ids', default: '' },
  },
  async run({ args }) {
    await initLanguage(parseLang(args.lang));
    p.intro(t('app.intro'));
    const ids = collectPositional(args);
    await installFlow({ ids, all: Boolean(args.all), yes: Boolean(args.yes) });
    p.outro(t('app.outro'));
  },
});

const uninstallCmd = defineCommand({
  meta: { name: 'uninstall', description: 'Uninstall installed plugins / MCP servers' },
  args: {
    ...sharedArgs,
    yes: { type: 'boolean' as const, description: 'Skip confirmation' },
    ids: { type: 'positional' as const, required: false, description: 'Item ids', default: '' },
  },
  async run({ args }) {
    await initLanguage(parseLang(args.lang));
    p.intro(t('app.intro'));
    const ids = collectPositional(args);
    await uninstallFlow({ ids, yes: Boolean(args.yes) });
    p.outro(t('app.outro'));
  },
});

const updateCmd = defineCommand({
  meta: { name: 'update', description: 'Update installed plugins' },
  args: {
    ...sharedArgs,
    all: { type: 'boolean' as const, description: 'Update all installed' },
    ids: { type: 'positional' as const, required: false, description: 'Item ids', default: '' },
  },
  async run({ args }) {
    await initLanguage(parseLang(args.lang));
    p.intro(t('app.intro'));
    const ids = collectPositional(args);
    await updateFlow({ ids, all: Boolean(args.all) });
    p.outro(t('app.outro'));
  },
});

const statusCmd = defineCommand({
  meta: { name: 'status', description: 'Show install status' },
  args: {
    ...sharedArgs,
    json: { type: 'boolean' as const, description: 'Output JSON (machine-readable)' },
  },
  async run({ args }) {
    await initLanguage(parseLang(args.lang));
    if (!args.json) p.intro(t('app.intro'));
    await statusFlow({ json: Boolean(args.json) });
    if (!args.json) p.outro(t('app.outro'));
  },
});

const SUBCOMMANDS = new Set(['install', 'uninstall', 'update', 'status']);

const root = defineCommand({
  meta: {
    name: '@curdx/flow',
    version: '3.1.0',
    description: 'Interactive installer for Claude Code plugins and MCP servers',
  },
  args: sharedArgs,
  subCommands: {
    install: installCmd,
    uninstall: uninstallCmd,
    update: updateCmd,
    status: statusCmd,
  },
  // No root run() — citty 0.1.6 calls parent.run AFTER a matching subcommand,
  // which would render the menu after a subcommand finishes. We dispatch the
  // interactive menu ourselves below for the no-subcommand case.
});

// Citty doesn't natively support repeated positional collection; gather them ourselves.
function collectPositional(args: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const rest = (args as { _?: string[] })._;
  if (Array.isArray(rest)) ids.push(...rest);
  const single = args['ids'];
  if (typeof single === 'string' && single.length > 0) ids.unshift(single);
  return ids;
}

function firstNonFlag(argv: string[]): string | undefined {
  for (const a of argv) {
    if (!a.startsWith('-')) return a;
  }
  return undefined;
}

async function runInteractive(argv: string[]): Promise<void> {
  // Cheap pre-parse for --lang only.
  let lang: Lang | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--lang' && argv[i + 1]) lang = parseLang(argv[i + 1]);
    else if (argv[i]?.startsWith('--lang=')) lang = parseLang(argv[i]!.slice('--lang='.length));
  }
  await initLanguage(lang);
  p.intro(t('app.intro'));
  await mainMenu();
  p.outro(t('app.outro'));
}

const argv = process.argv.slice(2);
const first = firstNonFlag(argv);
if (first === undefined || (first !== undefined && !SUBCOMMANDS.has(first) && first !== '--help' && first !== '-h')) {
  // No subcommand → interactive menu.
  // (--help / -h are flags, handled by citty if user typed them; we won't reach here.)
  if (first === undefined) {
    runInteractive(argv).catch((err) => {
      console.error(err);
      process.exit(1);
    });
  } else {
    // Unknown positional — let citty handle it (will throw E_UNKNOWN_COMMAND).
    runMain(root).catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
} else {
  runMain(root).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

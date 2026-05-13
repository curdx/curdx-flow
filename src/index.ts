import * as p from '@clack/prompts';
import { defineCommand, runMain } from 'citty';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initLanguage } from './ui/language.ts';
import { mainMenu } from './ui/menu.ts';
import { installFlow } from './flows/install.ts';
import { uninstallFlow } from './flows/uninstall.ts';
import { updateFlow } from './flows/update.ts';
import { statusFlow } from './flows/status.ts';
import analyzeCmd from './flows/analyze.ts';
import { t, type Lang } from './i18n/index.ts';
import { assertFreshLocalBuild } from './runner/buildFreshness.ts';

function readCliVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(resolve(here, '..', 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    return typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function parseLang(v: unknown): Lang | undefined {
  return v === 'zh' || v === 'en' ? v : undefined;
}

function noClaudeMdFromArgs(args: Record<string, unknown>): boolean {
  if (args['no-claude-md']) return true;
  return Boolean(process.env['CURDX_FLOW_NO_CLAUDE_MD']);
}

const sharedArgs = {
  lang: { type: 'string' as const, description: 'Override language: zh or en' },
  'no-claude-md': {
    type: 'boolean' as const,
    description: 'Skip syncing the @curdx/flow block in ~/.claude/CLAUDE.md',
  },
};

const installCmd = defineCommand({
  meta: { name: 'install', description: 'Install, reinstall, or update plugins / MCP servers' },
  args: {
    ...sharedArgs,
    all: { type: 'boolean' as const, description: 'Install all known items' },
    yes: { type: 'boolean' as const, description: 'Skip reinstall confirmation (assume yes)' },
    'no-refresh': { type: 'boolean' as const, description: 'Skip refreshing marketplace caches' },
    ids: { type: 'positional' as const, required: false, description: 'Item ids', default: '' },
  },
  async run({ args }) {
    await initLanguage(parseLang(args.lang));
    p.intro(t('app.intro'));
    const ids = collectPositional(args);
    await installFlow({
      ids,
      all: Boolean(args.all),
      yes: Boolean(args.yes),
      noRefresh: Boolean((args as Record<string, unknown>)['no-refresh']),
      noClaudeMd: noClaudeMdFromArgs(args as Record<string, unknown>),
    });
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
    await uninstallFlow({
      ids,
      yes: Boolean(args.yes),
      noClaudeMd: noClaudeMdFromArgs(args as Record<string, unknown>),
    });
    p.outro(t('app.outro'));
  },
});

const updateCmd = defineCommand({
  meta: { name: 'update', description: 'Update installed plugins' },
  args: {
    ...sharedArgs,
    all: { type: 'boolean' as const, description: 'Update all installed' },
    'no-refresh': { type: 'boolean' as const, description: 'Skip refreshing marketplace caches' },
    ids: { type: 'positional' as const, required: false, description: 'Item ids', default: '' },
  },
  async run({ args }) {
    await initLanguage(parseLang(args.lang));
    p.intro(t('app.intro'));
    const ids = collectPositional(args);
    await updateFlow({
      ids,
      all: Boolean(args.all),
      noRefresh: Boolean((args as Record<string, unknown>)['no-refresh']),
      noClaudeMd: noClaudeMdFromArgs(args as Record<string, unknown>),
    });
    p.outro(t('app.outro'));
  },
});

// Stub citty registration for the `check` subcommand. Real dispatch happens
// in the early-exit branch below (`process.argv[2] === 'check'`). This stub
// exists so citty's auto-generated `--help` lists the subcommand alongside
// the others. Its run() is a defensive fallback that should be unreachable.
const checkCmd = defineCommand({
  meta: {
    name: 'check',
    description: 'Verify active spec verificationBlocks (iron-law gate)',
  },
  args: {},
  async run() {
    const { runCheckCommand } = await import('./cli/commands/check.ts');
    await runCheckCommand([]);
  },
});

const statusCmd = defineCommand({
  meta: { name: 'status', description: 'Show install status' },
  args: {
    ...sharedArgs,
    json: { type: 'boolean' as const, description: 'Output JSON (machine-readable)' },
    'no-refresh': { type: 'boolean' as const, description: 'Skip refreshing marketplace caches' },
  },
  async run({ args }) {
    await initLanguage(parseLang(args.lang));
    if (!args.json) p.intro(t('app.intro'));
    await statusFlow({
      json: Boolean(args.json),
      noRefresh: Boolean((args as Record<string, unknown>)['no-refresh']),
    });
    if (!args.json) p.outro(t('app.outro'));
  },
});

const SUBCOMMANDS = new Set(['install', 'uninstall', 'update', 'status', 'analyze', 'check']);

// Help text for the `check` subcommand. Surfaced when the user runs
// `npx @curdx/flow check --help` or `--help` is forwarded after `check`.
// Kept as a top-level constant so it stays in sync with the citty meta block
// below and can be emitted directly by the early-dispatch branch (per Task
// 2.24 step 2: `if (process.argv[2] === 'check') call runCheckCommand`).
const CHECK_HELP = `USAGE \`@curdx/flow check\`

DESCRIPTION
  Verify the active spec's verificationBlocks (iron-law gate) — the same
  check enforced by the Stop hook and \`npm run verify\` release gate.

OPTIONS
  --help, -h    Show this help message and exit.

EXIT CODES
   0  All verificationBlocks valid (or no spec is active — graceful no-op).
   2  At least one phase block is missing, stale, or failed.

ENV
  CURDX_VERIFY_SKIP_BLOCKS=1   Skip the gate (human escape hatch; never set
                               in CI / release).

SEE ALSO
  plugins/curdx-flow/references/iron-law-verification.md
`;

const root = defineCommand({
  meta: {
    name: '@curdx/flow',
    version: readCliVersion(),
    description: 'Interactive installer for Claude Code plugins and MCP servers',
  },
  args: sharedArgs,
  subCommands: {
    install: installCmd,
    uninstall: uninstallCmd,
    update: updateCmd,
    status: statusCmd,
    analyze: analyzeCmd,
    check: checkCmd,
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

function firstCommandArg(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--lang') {
      i += 1;
      continue;
    }
    if (a.startsWith('--lang=')) continue;
    if (!a.startsWith('-')) return a;
  }
  return undefined;
}

function hasRootInfoFlag(argv: string[]): boolean {
  return argv.includes('--help') || argv.includes('-h') || argv.includes('--version') || argv.includes('-v');
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
const first = firstCommandArg(argv);
assertFreshLocalBuild();

if (first === undefined && (argv.includes('--version') || argv.includes('-v'))) {
  process.stdout.write(`${readCliVersion()}\n`);
  process.exit(0);
}

// Early dispatch for the `check` subcommand (Task 2.24).
// Matches the task spec literal: "if process.argv[2] === 'check', call
// runCheckCommand(process.argv.slice(3))". We bypass citty here because
// `runCheckCommand` calls process.exit directly (per Task 2.23) and has
// minimal arg-parsing needs — keeping it outside the citty tree avoids
// citty's defineCommand boilerplate while still surfacing in `--help`
// (handled below in the help-listing block).
if (process.argv[2] === 'check') {
  const rest = process.argv.slice(3);
  if (rest.includes('--help') || rest.includes('-h')) {
    process.stdout.write(CHECK_HELP);
    process.exit(0);
  }
  const { runCheckCommand } = await import('./cli/commands/check.ts');
  await runCheckCommand(rest);
  // runCheckCommand calls process.exit; we should not reach here.
  process.exit(0);
}

if (first === undefined && !hasRootInfoFlag(argv)) {
  // No subcommand → interactive menu.
  runInteractive(argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  // Root info flags, known subcommands, and unknown positionals all go through
  // citty so --help/--version and E_UNKNOWN_COMMAND behave normally.
  runMain(root).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

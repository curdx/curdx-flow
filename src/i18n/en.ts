import type { MessageKey } from './zh.ts';

const messages: Record<MessageKey, string> = {
  'app.intro': '@curdx/flow — Claude Code plugin & MCP installer',
  'app.outro': 'Done.',
  'app.cancelled': 'Cancelled.',

  'lang.prompt': 'Please choose your language / 请选择界面语言',
  'lang.zh': '中文',
  'lang.en': 'English',

  'menu.title': 'What would you like to do?',
  'menu.install': 'Install / reinstall plugins & MCP servers',
  'menu.update': 'Update installed plugins',
  'menu.uninstall': 'Uninstall installed plugins & MCP servers',
  'menu.status': 'Show current install status',
  'menu.exit': 'Exit',

  'pkg.installed': 'installed',
  'pkg.notInstalled': 'not installed',
  'pkg.unknown': 'unknown',
  'pkg.upToDateWithVersion': 'installed v{version}',
  'pkg.updateAvailable': 'v{current} → v{latest} available',

  'marketplace.refreshing': 'Refreshing marketplace caches…',
  'marketplace.refreshed': 'Refreshed {count} marketplace(s)',
  'marketplace.refreshSkipped': 'Marketplace caches are fresh, skipping refresh',

  'install.updating': 'Updating "{name}" to v{version}',

  'install.requiredHeader': 'Always installed by @curdx/flow (cannot be unchecked)',
  'install.selectPrompt': 'Select items to install / reinstall (not-installed are pre-selected)',
  'install.nothingSelected': 'Nothing selected. Exiting.',
  'install.confirmReinstall': '"{name}" is already installed. Reinstall (uninstall then install)?',
  'install.skippedReinstall': 'Skipped "{name}" (already installed).',
  'install.prereqFail': 'Prerequisite failed for "{name}": {reason}',
  'install.starting': 'Installing "{name}"',
  'install.success': '"{name}" installed',
  'install.failed': '"{name}" failed',
  'install.summaryTitle': 'Install summary',
  'install.summaryOk': '{count} succeeded',
  'install.summaryFail': '{count} failed',
  'install.summarySkip': '{count} skipped',

  'uninstall.selectPrompt': 'Select items to uninstall (only currently installed shown)',
  'uninstall.noneInstalled': 'None of the managed items are currently installed.',
  'uninstall.confirm': 'About to uninstall {count} item(s). Proceed?',
  'uninstall.starting': 'Uninstalling "{name}"',
  'uninstall.success': '"{name}" uninstalled',
  'uninstall.failed': '"{name}" failed to uninstall',

  'update.selectPrompt': 'Select items to update',
  'update.noneInstalled': 'No installed items available to update.',
  'update.starting': 'Updating "{name}"',
  'update.success': '"{name}" updated',
  'update.failed': '"{name}" failed to update',

  'status.title': 'Current status',
  'status.headerName': 'Name',
  'status.headerType': 'Type',
  'status.headerState': 'State',



  'bun.missing': 'Bun runtime not found — claude-mem\'s background worker requires Bun.',
  'bun.installerSource': 'Bun installer source: https://bun.sh (curl on macOS/Linux, PowerShell irm on Windows).',
  'bun.confirmInstall': 'Auto-install Bun now? (default: No — declining will skip claude-mem; other packages continue)',
  'bun.declined': 'Bun install declined; claude-mem requires Bun and will be skipped this run. Install Bun manually and re-run install.',
  'bun.installing': 'Downloading and installing Bun (~60 MB on first run)…',
  'bun.installed': 'Bun installed.',
  'bun.installFailedTitle': 'Bun install failed',
  'bun.installFailedReason': 'Bun install failed: {error}',
  'bun.installedButNotFound': 'Bun installer reported success but bun was not found at any known path — verify manually and re-run.',

  'reinstall.uninstalling': 'Uninstalling old version…',
  'reinstall.installing': 'Installing new version…',

  'state.checking': 'Checking installed state… (claude plugin list / mcp list)',
  'state.checked': 'Checked {count} item(s)',

  'claudeMd.syncing': 'Syncing ~/.claude/CLAUDE.md…',
  'claudeMd.synced': 'CLAUDE.md updated ({path})',
  'claudeMd.unchanged': 'CLAUDE.md already up to date',
  'claudeMd.removed': 'Removed @curdx/flow block from CLAUDE.md',
  'claudeMd.skipped': 'Skipped CLAUDE.md sync (--no-claude-md)',
  'claudeMd.failed': 'CLAUDE.md sync failed: {error}',

  'analyze.description': 'Analyze Claude Code session jsonl + curdx-flow errors.jsonl, output markdown report',
  'analyze.helpSummary': 'analyze — local observability: merge ~/.claude/projects/<cwd-encoded>/<sessionId>.jsonl with ~/.claude/curdx-flow/errors.jsonl into 7 markdown sections (hook failures / slash command frequency / subagent dispatch / spec funnel / hook duration P50/P95/P99 / schema drift / parentUuid chain integrity)',
  'analyze.flags.json': 'Emit JSON instead of markdown (CI-friendly; --out is ignored when --json is set)',
  'analyze.flags.out': 'Write the markdown report to the given file path (defaults to stdout)',
  'analyze.flags.limit': 'Top-N truncation for tabular sections (default 10; 0 falls back to 10)',
  'analyze.flags.since': 'Only count events within a relative window such as `7d` / `24h` / `30m` (default: full history; --since coexists with the incremental offset cache, replays the last report when cache hits)',
  'analyze.flags.project': 'Pin to a specific encoded-cwd directory under ~/.claude/projects/; defaults to inferring from the current git repository root (non-git directories degrade to an empty report with a warning)',
  'analyze.flags.includePrompts': 'Skip default redaction and pass raw prompt text through (local debugging only; D-9 white-list redacts every non-whitelisted field by default)',
  'analyze.warning.noProject': 'Could not infer a ~/.claude/projects/ subdirectory from cwd (not a git repo or no matching session); emitting an empty report — pass --project to override',
  'analyze.warning.schemaFallback': 'plugins/curdx-flow/schemas/transcript-events.json not found, falling back to the builtin minimal whitelist — schema drift diagnostics may underreport',
};

export default messages;

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
  'update.mcpAutoNote': '"{name}" runs via npx -y and auto-pulls latest on every launch. No manual update needed.',
  'update.context7Note': 'context7 is a remote HTTP service, updated server-side. No local action needed.',

  'status.title': 'Current status',
  'status.headerName': 'Name',
  'status.headerType': 'Type',
  'status.headerState': 'State',

  'context7.askKey': 'Provide a context7 API key? (Enter to skip and use the free tier)',
  'context7.keyPlaceholder': 'Paste API key, or leave blank to skip',
  'context7.keyWarning': 'Note: the API key is written to ~/.claude.json in plaintext.',
  'context7.dashboardHint': 'Get a key at https://context7.com/dashboard',

  'chrome.prereqNode': 'Requires Node.js >= 20.19 (current: {current})',
  'chrome.prereqChrome': 'Requires Chrome installed locally (chrome-devtools-mcp drives the local browser)',

  'reinstall.uninstalling': 'Uninstalling old version…',
  'reinstall.installing': 'Installing new version…',
};

export default messages;

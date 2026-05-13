import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Pkg, PrereqResult } from '../types.ts';
import { isPluginInstalledAtScope } from '../../runner/state.ts';
import {
  ensureMarketplace,
  installPluginById,
  PLUGIN_SCOPE,
  uninstallPluginById,
  updatePluginById,
} from './_helpers.ts';
import { run } from '../../runner/exec.ts';

// Marketplace name comes from the repo's .claude-plugin/marketplace.json,
// not from the GitHub repo name — here the repo is ChromeDevTools/chrome-devtools-mcp
// but the marketplace identifier inside is "chrome-devtools-plugins".
const PLUGIN_ID = 'chrome-devtools-mcp@chrome-devtools-plugins';
const MARKETPLACE_NAME = 'chrome-devtools-plugins';
const MARKETPLACE_SOURCE = 'ChromeDevTools/chrome-devtools-mcp';

// Per-platform detection mirrors GoogleChrome/chrome-launcher's chrome-finder:
// env-prefix × known suffix on Windows, canonical app-bundle path on macOS,
// PATH lookup on Linux. CHROME_PATH override applies on all platforms.
async function checkChrome(): Promise<boolean> {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return true;

  if (process.platform === 'win32') {
    const suffixes = [
      path.join('Google', 'Chrome SxS', 'Application', 'chrome.exe'),
      path.join('Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    const prefixes = [
      process.env.LOCALAPPDATA,
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
    ].filter((p): p is string => Boolean(p));
    for (const prefix of prefixes) {
      for (const suffix of suffixes) {
        if (existsSync(path.join(prefix, suffix))) return true;
      }
    }
    return false;
  }

  if (process.platform === 'darwin') {
    return existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  }

  const [viaPath, viaPathChromium] = await Promise.all([
    run('which', ['google-chrome']),
    run('which', ['chromium']),
  ]);
  return viaPath.exitCode === 0 || viaPathChromium.exitCode === 0;
}

const chromeDevtoolsMcp: Pkg = {
  id: 'chrome-devtools-mcp',
  name: 'chrome-devtools-mcp',
  description: 'ChromeDevTools/chrome-devtools-mcp — drive a real Chrome from Claude Code',
  type: 'plugin',
  required: true,
  whenToUse:
    'when debugging code that runs in a browser: perf traces, network / console inspection, DOM / CSS issues. Prefer snapshot over screenshot.',
  prereqCheck: async (t): Promise<PrereqResult> => {
    const major = Number(process.versions.node.split('.')[0] ?? '0');
    const minor = Number(process.versions.node.split('.')[1] ?? '0');
    if (major < 20 || (major === 20 && minor < 19)) {
      return { ok: false, reason: t('chrome.prereqNode', { current: process.versions.node }) };
    }
    if (!(await checkChrome())) {
      return { ok: false, reason: t('chrome.prereqChrome') };
    }
    return { ok: true };
  },
  isInstalled: () => isPluginInstalledAtScope(PLUGIN_ID, PLUGIN_SCOPE),
  install: async (ctx) => {
    await ensureMarketplace(MARKETPLACE_NAME, MARKETPLACE_SOURCE, ctx);
    await installPluginById(PLUGIN_ID, ctx);
  },
  uninstall: (ctx) => uninstallPluginById(PLUGIN_ID, ctx),
  update: (ctx) => updatePluginById(PLUGIN_ID, ctx),
};

export default chromeDevtoolsMcp;

import type { Pkg, PrereqResult } from '../types.ts';
import { isPluginInstalled } from '../../runner/state.ts';
import {
  ensureMarketplace,
  installPluginById,
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

async function checkChrome(): Promise<boolean> {
  // macOS canonical install path; fall back to checking PATH for `google-chrome` or `chromium`.
  const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const [stat, viaPath, viaPathChromium] = await Promise.all([
    run('test', ['-x', macPath]),
    run('which', ['google-chrome']),
    run('which', ['chromium']),
  ]);
  return stat.exitCode === 0 || viaPath.exitCode === 0 || viaPathChromium.exitCode === 0;
}

const chromeDevtoolsMcp: Pkg = {
  id: 'chrome-devtools-mcp',
  name: 'chrome-devtools-mcp',
  description: 'ChromeDevTools/chrome-devtools-mcp — drive a real Chrome from Claude Code',
  type: 'plugin',
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
  isInstalled: () => isPluginInstalled(PLUGIN_ID),
  install: async (ctx) => {
    await ensureMarketplace(MARKETPLACE_NAME, MARKETPLACE_SOURCE, ctx);
    await installPluginById(PLUGIN_ID, ctx);
  },
  uninstall: (ctx) => uninstallPluginById(PLUGIN_ID, ctx),
  update: (ctx) => updatePluginById(PLUGIN_ID, ctx),
};

export default chromeDevtoolsMcp;

import * as p from '@clack/prompts';
import type { Pkg } from '../types.ts';
import { runStreaming, ensureOk } from '../../runner/exec.ts';
import { isMcpInstalled, clearStateCache } from '../../runner/state.ts';

const MCP_NAME = 'context7';
const URL = 'https://mcp.context7.com/mcp';

const context7: Pkg = {
  id: 'context7',
  name: 'context7',
  description: 'upstash/context7 — up-to-date docs from any library (HTTP MCP, optional API key)',
  type: 'mcp',
  isInstalled: () => isMcpInstalled(MCP_NAME),
  configPrompts: async ({ t }) => {
    p.note(`${t('context7.dashboardHint')}\n${t('context7.keyWarning')}`, 'context7');
    const key = await p.text({
      message: t('context7.askKey'),
      placeholder: t('context7.keyPlaceholder'),
      defaultValue: '',
    });
    if (p.isCancel(key)) return null;
    const trimmed = String(key ?? '').trim();
    const out: Record<string, string> = {};
    if (trimmed) out['CONTEXT7_API_KEY'] = trimmed;
    return out;
  },
  install: async (ctx) => {
    const args = [
      'mcp', 'add',
      '--scope', 'user',
      '--transport', 'http',
    ];
    const apiKey = ctx.config['CONTEXT7_API_KEY'];
    if (apiKey) {
      args.push('--header', `CONTEXT7_API_KEY: ${apiKey}`);
    }
    args.push(MCP_NAME, URL);
    const r = await runStreaming('claude', args, ctx.log);
    ensureOk(r, `mcp add ${MCP_NAME}`);
    clearStateCache();
  },
  uninstall: async (ctx) => {
    if (!(await isMcpInstalled(MCP_NAME))) return;
    const r = await runStreaming('claude', ['mcp', 'remove', MCP_NAME], ctx.log);
    ensureOk(r, `mcp remove ${MCP_NAME}`);
    clearStateCache();
  },
};

export default context7;

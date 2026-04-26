import type { Pkg } from '../types.ts';
import { runStreaming, ensureOk } from '../../runner/exec.ts';
import { isMcpInstalled, clearStateCache } from '../../runner/state.ts';

const MCP_NAME = 'sequential-thinking';

const sequentialThinking: Pkg = {
  id: 'sequential-thinking',
  name: 'sequential-thinking',
  description: 'modelcontextprotocol/server-sequential-thinking — structured reasoning helper',
  type: 'mcp',
  isInstalled: () => isMcpInstalled(MCP_NAME),
  install: async (ctx) => {
    const r = await runStreaming(
      'claude',
      [
        'mcp', 'add',
        '--scope', 'user',
        MCP_NAME,
        '--',
        'npx', '-y', '@modelcontextprotocol/server-sequential-thinking',
      ],
      ctx.log,
    );
    ensureOk(r, `mcp add ${MCP_NAME}`);
    clearStateCache();
  },
  uninstall: async (ctx) => {
    if (!(await isMcpInstalled(MCP_NAME))) return;
    const r = await runStreaming('claude', ['mcp', 'remove', MCP_NAME], ctx.log);
    ensureOk(r, `mcp remove ${MCP_NAME}`);
    clearStateCache();
  },
  // For npx-based MCPs the latest version is fetched at every launch — nothing to do.
  // Flow layer detects update?===noop and shows the i18n note instead.
};

export default sequentialThinking;

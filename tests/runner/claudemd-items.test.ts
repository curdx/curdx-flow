import { afterEach, describe, expect, it, vi } from 'vitest';

// collectInstalledItems reads installed plugins + detect-only MCPs from native state.
// Mock the state layer so we can assert the ManagedItem set (which drives the CLAUDE.md
// block) without a live `claude plugin list` / `claude mcp list`.
const installedPluginIds = new Set<string>();
let mcpEntries: { name: string; raw: string }[] = [];

vi.mock('../../src/runner/state.ts', () => ({
  listPlugins: vi.fn(async () => []),
  listMcp: vi.fn(async () => mcpEntries),
  isPluginInstalledAtScope: vi.fn(async (id: string) => installedPluginIds.has(id)),
  findPluginAtScope: vi.fn(async (id: string) =>
    installedPluginIds.has(id) ? { id, name: id, marketplace: 'm', version: '1.2.3' } : undefined,
  ),
}));

import { collectInstalledItems } from '../../src/runner/claudeMd.ts';

afterEach(() => {
  installedPluginIds.clear();
  mcpEntries = [];
  vi.clearAllMocks();
});

describe('collectInstalledItems', () => {
  it('includes installed plugins with their version and catalog metadata', async () => {
    installedPluginIds.add('curdx-flow@curdx');
    installedPluginIds.add('pua@pua-skills');

    const items = await collectInstalledItems();
    const byId = new Map(items.map((i) => [i.id, i]));

    expect(byId.get('curdx-flow')).toMatchObject({ type: 'plugin', version: '1.2.3', slashNamespace: '/curdx-flow:*' });
    expect(byId.get('pua')).toMatchObject({ type: 'plugin', version: '1.2.3' });
    // not-installed companions are absent
    expect(byId.has('claude-mem')).toBe(false);
  });

  it('detects an external MCP by its canonical name', async () => {
    mcpEntries = [{ name: 'context7', raw: 'context7: https://mcp.context7.com/mcp' }];
    const items = await collectInstalledItems();
    expect(items.find((i) => i.id === 'context7')).toMatchObject({ type: 'mcp' });
  });

  it('detects an external MCP installed under a non-canonical name via the URL/command in the raw line', async () => {
    mcpEntries = [
      { name: 'docs', raw: 'docs: https://mcp.context7.com/mcp' },
      { name: 'thinking', raw: 'thinking: npx -y @modelcontextprotocol/server-sequential-thinking' },
    ];
    const ids = (await collectInstalledItems()).map((i) => i.id);
    expect(ids).toContain('context7');
    expect(ids).toContain('sequential-thinking');
  });

  it('excludes external MCPs that are not present in `claude mcp list`', async () => {
    mcpEntries = [{ name: 'unrelated', raw: 'unrelated: https://example.com/mcp' }];
    const items = await collectInstalledItems();
    expect(items.some((i) => i.type === 'mcp')).toBe(false);
  });

  it('sorts installed plugins before detected MCPs', async () => {
    installedPluginIds.add('curdx-flow@curdx');
    mcpEntries = [{ name: 'context7', raw: 'context7' }];
    const items = await collectInstalledItems();
    const firstMcpIdx = items.findIndex((i) => i.type === 'mcp');
    const lastPluginIdx = items.map((i) => i.type).lastIndexOf('plugin');
    expect(firstMcpIdx).toBeGreaterThan(-1);
    expect(lastPluginIdx).toBeLessThan(firstMcpIdx);
  });
});

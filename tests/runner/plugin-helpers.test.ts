import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { InstallCtx } from '../../src/registry/types.ts';

const mocks = vi.hoisted(() => ({
  runStreaming: vi.fn(),
  clearStateCache: vi.fn(),
  findPlugin: vi.fn(),
  isMarketplaceAdded: vi.fn(),
}));

vi.mock('../../src/runner/exec.ts', async () => {
  const actual = await vi.importActual<typeof import('../../src/runner/exec.ts')>('../../src/runner/exec.ts');
  return {
    ...actual,
    runStreaming: mocks.runStreaming,
  };
});

vi.mock('../../src/runner/state.ts', () => ({
  clearStateCache: mocks.clearStateCache,
  findPlugin: mocks.findPlugin,
  isMarketplaceAdded: mocks.isMarketplaceAdded,
}));

const ctx = {
  log: {
    message: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    group: vi.fn(() => ({ message: vi.fn(), success: vi.fn(), error: vi.fn() })),
  } as unknown as InstallCtx['log'],
  config: {},
  t: ((key: string) => key) as InstallCtx['t'],
} satisfies InstallCtx;

describe('plugin command helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runStreaming.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
  });

  test('updates an installed plugin at its actual scope', async () => {
    const { updatePluginById } = await import('../../src/registry/plugins/_helpers.ts');
    mocks.findPlugin.mockResolvedValue({ id: 'curdx-flow@curdx', scope: 'local' });

    await updatePluginById('curdx-flow@curdx', ctx);

    expect(mocks.runStreaming).toHaveBeenCalledWith(
      'claude',
      ['plugin', 'update', 'curdx-flow@curdx', '--scope', 'local'],
      ctx.log,
    );
    expect(mocks.clearStateCache).toHaveBeenCalledTimes(1);
  });

  test('uninstalls an installed plugin at its actual scope', async () => {
    const { uninstallPluginById } = await import('../../src/registry/plugins/_helpers.ts');
    mocks.findPlugin.mockResolvedValue({ id: 'pua@pua-skills', scope: 'project' });

    await uninstallPluginById('pua@pua-skills', ctx);

    expect(mocks.runStreaming).toHaveBeenCalledWith(
      'claude',
      ['plugin', 'uninstall', 'pua@pua-skills', '--scope', 'project'],
      ctx.log,
    );
  });

  test('installs plugins explicitly to user scope', async () => {
    const { installPluginById } = await import('../../src/registry/plugins/_helpers.ts');

    await installPluginById('frontend-design@claude-plugins-official', ctx);

    expect(mocks.runStreaming).toHaveBeenCalledWith(
      'claude',
      ['plugin', 'install', 'frontend-design@claude-plugins-official', '--scope', 'user'],
      ctx.log,
    );
  });
});

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { InstallCtx } from '../../src/registry/types.ts';

const mocks = vi.hoisted(() => ({
  runStreaming: vi.fn(),
  clearStateCache: vi.fn(),
  getMarketplacePluginVersion: vi.fn(),
  isPluginInstalledAtScope: vi.fn(),
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
  getMarketplacePluginVersion: mocks.getMarketplacePluginVersion,
  isPluginInstalledAtScope: mocks.isPluginInstalledAtScope,
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
    mocks.isPluginInstalledAtScope.mockResolvedValue(true);
  });

  test('updates plugins only at user scope', async () => {
    const { updatePluginById } = await import('../../src/registry/plugins/_helpers.ts');

    await updatePluginById('curdx-flow@curdx', ctx);

    expect(mocks.runStreaming).toHaveBeenCalledWith(
      'claude',
      ['plugin', 'update', 'curdx-flow@curdx', '--scope', 'user'],
      ctx.log,
    );
    expect(mocks.clearStateCache).toHaveBeenCalledTimes(1);
  });

  test('uninstalls plugins only when installed at user scope', async () => {
    const { uninstallPluginById } = await import('../../src/registry/plugins/_helpers.ts');

    await uninstallPluginById('pua@pua-skills', ctx);

    expect(mocks.isPluginInstalledAtScope).toHaveBeenCalledWith('pua@pua-skills', 'user');
    expect(mocks.runStreaming).toHaveBeenCalledWith(
      'claude',
      ['plugin', 'uninstall', 'pua@pua-skills', '--scope', 'user'],
      ctx.log,
    );
  });

  test('does not uninstall plugins that are absent from user scope', async () => {
    const { uninstallPluginById } = await import('../../src/registry/plugins/_helpers.ts');
    mocks.isPluginInstalledAtScope.mockResolvedValue(false);

    await uninstallPluginById('pua@pua-skills', ctx);

    expect(mocks.runStreaming).not.toHaveBeenCalled();
  });

  test('installs plugins explicitly to user scope', async () => {
    const { installPluginById } = await import('../../src/registry/plugins/_helpers.ts');

    await installPluginById('ui-ux-pro-max@ui-ux-pro-max-skill', ctx);

    expect(mocks.runStreaming).toHaveBeenCalledWith(
      'claude',
      ['plugin', 'install', 'ui-ux-pro-max@ui-ux-pro-max-skill', '--scope', 'user'],
      ctx.log,
    );
  });

  test('can force-refresh a marketplace before retrying install', async () => {
    const { refreshMarketplace } = await import('../../src/registry/plugins/_helpers.ts');

    await refreshMarketplace('ui-ux-pro-max-skill', ctx);

    expect(mocks.runStreaming).toHaveBeenCalledWith(
      'claude',
      ['plugin', 'marketplace', 'update', 'ui-ux-pro-max-skill'],
      ctx.log,
    );
    expect(mocks.clearStateCache).toHaveBeenCalledTimes(1);
  });

  test('frontend-design refreshes official marketplace before retrying a failed install', async () => {
    const frontendDesign = (await import('../../src/registry/plugins/frontend-design.ts')).default;
    mocks.runStreaming
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'not found' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

    await frontendDesign.install(ctx);

    expect(mocks.runStreaming).toHaveBeenNthCalledWith(
      1,
      'claude',
      ['plugin', 'marketplace', 'add', 'anthropics/claude-plugins-official'],
      ctx.log,
    );
    expect(mocks.runStreaming).toHaveBeenNthCalledWith(
      2,
      'claude',
      ['plugin', 'install', 'frontend-design@claude-plugins-official', '--scope', 'user'],
      ctx.log,
    );
    expect(mocks.runStreaming).toHaveBeenNthCalledWith(
      3,
      'claude',
      ['plugin', 'marketplace', 'update', 'claude-plugins-official'],
      ctx.log,
    );
    expect(mocks.runStreaming).toHaveBeenNthCalledWith(
      4,
      'claude',
      ['plugin', 'install', 'frontend-design@claude-plugins-official', '--scope', 'user'],
      ctx.log,
    );
  });
});

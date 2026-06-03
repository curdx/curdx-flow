import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CmdResult } from '../../src/runner/exec.ts';
import type { InstallCtx } from '../../src/runner/types.ts';

const runStreamingMock = vi.fn<(cmd: string, args: string[], log: unknown) => Promise<CmdResult>>();
const clearStateCacheMock = vi.fn();

vi.mock('../../src/runner/exec.ts', async () => {
  const actual = await vi.importActual<typeof import('../../src/runner/exec.ts')>('../../src/runner/exec.ts');
  return {
    ...actual,
    runStreaming: runStreamingMock,
  };
});

vi.mock('../../src/runner/state.ts', () => ({
  clearStateCache: clearStateCacheMock,
  isMarketplaceAdded: vi.fn(async () => true),
  isPluginInstalledAtScope: vi.fn(async () => true),
}));

const ok: CmdResult = { exitCode: 0, stdout: '', stderr: '' };
const alreadyEnabled: CmdResult = {
  exitCode: 1,
  stdout: '',
  stderr: 'Plugin "foo@bar" is already enabled at user scope',
};
const realFailure: CmdResult = {
  exitCode: 1,
  stdout: '',
  stderr: 'connection refused',
};

const ctx = {
  log: { message: vi.fn() },
  config: {},
  t: ((k: string) => k) as InstallCtx['t'],
} as unknown as InstallCtx;

describe('native plugin-CLI primitives', () => {
  beforeEach(() => {
    runStreamingMock.mockReset();
    clearStateCacheMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('installPluginById invokes install then enable, in that order', async () => {
    const { installPluginById } = await import('../../src/runner/plugin-cli.ts');
    runStreamingMock.mockResolvedValueOnce(ok).mockResolvedValueOnce(ok);

    await installPluginById('foo@bar', ctx);

    expect(runStreamingMock).toHaveBeenCalledTimes(2);
    expect(runStreamingMock.mock.calls[0]?.[1]).toEqual(['plugin', 'install', 'foo@bar', '--scope', 'user']);
    expect(runStreamingMock.mock.calls[1]?.[1]).toEqual(['plugin', 'enable', 'foo@bar', '--scope', 'user']);
  });

  it('updatePluginById invokes update then enable, in that order', async () => {
    const { updatePluginById } = await import('../../src/runner/plugin-cli.ts');
    runStreamingMock.mockResolvedValueOnce(ok).mockResolvedValueOnce(ok);

    await updatePluginById('foo@bar', ctx);

    expect(runStreamingMock).toHaveBeenCalledTimes(2);
    expect(runStreamingMock.mock.calls[0]?.[1]).toEqual(['plugin', 'update', 'foo@bar', '--scope', 'user']);
    expect(runStreamingMock.mock.calls[1]?.[1]).toEqual(['plugin', 'enable', 'foo@bar', '--scope', 'user']);
  });

  it('enablePluginById tolerates the "already enabled" non-zero exit (idempotent)', async () => {
    const { enablePluginById } = await import('../../src/runner/plugin-cli.ts');
    runStreamingMock.mockResolvedValueOnce(alreadyEnabled);

    await expect(enablePluginById('foo@bar', ctx)).resolves.toBeUndefined();
    expect(clearStateCacheMock).toHaveBeenCalled();
  });

  it('enablePluginById still throws on genuine non-zero exits', async () => {
    const { enablePluginById } = await import('../../src/runner/plugin-cli.ts');
    runStreamingMock.mockResolvedValueOnce(realFailure);

    await expect(enablePluginById('foo@bar', ctx)).rejects.toThrow(/plugin enable foo@bar/);
  });

  it('installPluginById survives a dependency-already-enabled tail (regression: pua dep)', async () => {
    const { installPluginById } = await import('../../src/runner/plugin-cli.ts');
    runStreamingMock.mockResolvedValueOnce(ok).mockResolvedValueOnce(alreadyEnabled);

    await expect(installPluginById('foo@bar', ctx)).resolves.toBeUndefined();
  });
});

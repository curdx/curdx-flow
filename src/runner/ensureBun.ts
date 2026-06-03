import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import type { PrereqResult } from './types.ts';
import type { Translate } from '../i18n/index.ts';
import { run } from './exec.ts';

const IS_WINDOWS = process.platform === 'win32';

function fallbackPaths(): string[] {
  const home = homedir();
  if (IS_WINDOWS) return [path.join(home, '.bun', 'bin', 'bun.exe')];
  return [
    path.join(home, '.bun', 'bin', 'bun'),
    '/usr/local/bin/bun',
    '/opt/homebrew/bin/bun',
    '/home/linuxbrew/.linuxbrew/bin/bun',
  ];
}

export async function findBun(): Promise<string | null> {
  const probe = IS_WINDOWS ? await run('where', ['bun']) : await run('which', ['bun']);
  if (probe.exitCode === 0 && probe.stdout.trim()) {
    const lines = probe.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (IS_WINDOWS) {
      const cmd = lines.find((l) => l.toLowerCase().endsWith('bun.cmd') || l.toLowerCase().endsWith('bun.exe'));
      if (cmd) return cmd;
    }
    if (lines[0]) return lines[0];
  }
  for (const candidate of fallbackPaths()) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function runInstaller(): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = IS_WINDOWS
    ? await run('powershell', ['-NoProfile', '-Command', 'irm bun.sh/install.ps1 | iex'])
    : await run('bash', ['-lc', 'curl -fsSL https://bun.sh/install | bash']);
  if (result.exitCode !== 0) {
    const detail = (result.stderr || result.stdout || '').trim().slice(0, 500);
    return { ok: false, error: detail || `exit ${result.exitCode}` };
  }
  return { ok: true };
}

export async function ensureBun(t: Translate): Promise<PrereqResult> {
  const found = await findBun();
  if (found) return { ok: true };

  p.log.warn(t('bun.missing'));
  p.log.info(t('bun.installerSource'));
  const ans = await p.confirm({
    message: t('bun.confirmInstall'),
    initialValue: false,
  });
  if (p.isCancel(ans) || ans === false) {
    return { ok: false, reason: t('bun.declined') };
  }

  const sp = p.spinner();
  sp.start(t('bun.installing'));
  const result = await runInstaller();
  if (!result.ok) {
    sp.stop(t('bun.installFailedTitle'));
    return { ok: false, reason: t('bun.installFailedReason', { error: result.error }) };
  }
  sp.stop(t('bun.installed'));

  const reFound = await findBun();
  if (!reFound) {
    return { ok: false, reason: t('bun.installedButNotFound') };
  }
  return { ok: true };
}

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'dist', 'index.mjs');

function runCli(args: string[]) {
  return spawnSync('node', [CLI_ENTRY, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      CURDX_FLOW_NO_CLAUDE_MD: '1',
    },
  });
}

describe('root CLI flags', () => {
  test('--version prints package version instead of opening the interactive menu', () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
      version: string;
    };

    const result = runCli(['--version']);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toContain(pkg.version);
    expect(result.stdout).not.toContain('What would you like to do?');
  });

  test('root --lang value is not treated as an unknown command when paired with --version', () => {
    const result = runCli(['--lang', 'zh', '--version']);

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('Unknown command');
  });
});

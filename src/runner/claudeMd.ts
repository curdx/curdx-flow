import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as p from '@clack/prompts';
import { listPlugins, listMcp } from './state.ts';
import { PKGS } from '../registry/index.ts';
import type { Pkg } from '../registry/types.ts';
import { t } from '../i18n/index.ts';
import { getLang } from '../i18n/index.ts';
import {
  renderCapabilityDecisionTree,
  renderInstalledCapabilityRules,
} from '../hooks/lib/tool-capabilities.ts';

const BEGIN_MARKER = '<!-- BEGIN @curdx/flow v1 -->';
const END_MARKER = '<!-- END @curdx/flow v1 -->';
// Match BEGIN/END pair regardless of v-suffix differences (forward-compat for v2/v3 migration).
const BLOCK_RE = /<!-- BEGIN @curdx\/flow v\d+[^>]*-->[\s\S]*?<!-- END @curdx\/flow v\d+ -->/;

export type ManagedItem = {
  id: string;
  name: string;
  type: 'plugin' | 'mcp';
  version?: string;
  whenToUse?: string;
  slashNamespace?: string;
};

export type SyncStatus = 'created' | 'updated' | 'unchanged' | 'removed' | 'skipped' | 'failed';

export type SyncResult = {
  status: SyncStatus;
  path: string;
  error?: string;
};

export function claudeMdPath(): string {
  return path.join(os.homedir(), '.claude', 'CLAUDE.md');
}

// ---------- pure rendering ----------

function buildCombinationPatterns(ids: Set<string>): string[] {
  const out = renderInstalledCapabilityRules([...ids]);
  if (ids.has('curdx-flow')) {
    out.push('- /curdx-flow:start: Use for ambiguous, cross-cutting, phase-based, or multi-root work; skip for small direct edits.');
    out.push('- /curdx-flow:triage: Use when one request is too large for a single coherent spec.');
  }
  return out;
}

function buildSkipRules(ids: Set<string>): string[] {
  const has = (k: string) => ids.has(k);
  const out: string[] = [];
  out.push('- For one-line changes, typos, or pure renames, skip planning and spec flow. Just make the edit.');
  const skips: string[] = [];
  if (has('pua')) skips.push('`/pua:pua-loop`');
  if (has('sequential-thinking')) skips.push('`sequential-thinking`');
  if (skips.length > 0) {
    out.push(`- For a known, deterministic fix, do not reach for ${skips.join(' or ')} first.`);
  }
  out.push('- Answer pure conceptual explanation questions directly. If the question is about code in this repository, read the relevant files first.');
  if (has('curdx-flow')) {
    out.push('- For a single-file refactor or a very local cleanup, usually do not enter the curdx-flow spec workflow.');
  }
  return out;
}

function buildDecisionTree(ids: Set<string>): string[] {
  const out = renderCapabilityDecisionTree([...ids]);
  if (ids.has('curdx-flow')) {
    out.push('7. Is the request ambiguous, cross-cutting, phase-based, or multi-root? -> Run /curdx-flow:start.');
  }
  return out;
}

function buildLanguagePolicy(): string[] {
  if (getLang() !== 'zh') return [];
  return [
    '- Tool and model interaction must be in English.',
    '- All user-facing responses must be in Simplified Chinese.',
  ];
}

export function renderBlock(items: ManagedItem[]): string {
  const installedIds = new Set(items.map((i) => i.id));
  const sections: Array<[string, string[]]> = [
    ['## Language Policy', buildLanguagePolicy()],
    ['## Tool Combination Patterns', buildCombinationPatterns(installedIds)],
    ['## Skip Rules', buildSkipRules(installedIds)],
    ['## Decision Tree', buildDecisionTree(installedIds)],
  ];
  const lines: string[] = [BEGIN_MARKER];
  for (const [heading, body] of sections) {
    if (body.length === 0) continue;
    lines.push(heading, '', ...body, '');
  }
  lines.push(END_MARKER);
  return lines.join('\n');
}

// ---------- pure file mutation ----------

function withEol(s: string, eol: string): string {
  return eol === '\n' ? s : s.split('\n').join(eol);
}

function ensureSingleTrailingNewline(s: string, eol: string): string {
  if (s.length === 0) return s;
  return s.replace(/[\r\n]+$/, '') + eol;
}

export function upsertBlock(existing: string, blockBody: string, eol: '\n' | '\r\n'): string {
  const block = withEol(blockBody, eol);
  if (BLOCK_RE.test(existing)) {
    return existing.replace(BLOCK_RE, block);
  }
  if (existing.length === 0) {
    return block + eol;
  }
  const trimmed = existing.replace(/[\r\n\s]+$/, '');
  return trimmed + eol + eol + block + eol;
}

export function removeBlock(existing: string, eol: '\n' | '\r\n'): string {
  if (!BLOCK_RE.test(existing)) return existing;
  let next = existing.replace(BLOCK_RE, '');
  // Collapse 3+ consecutive newlines (left behind when block sat between blank lines) → 2.
  const tripleEol = new RegExp(`(?:\\r?\\n){3,}`, 'g');
  next = next.replace(tripleEol, eol + eol);
  if (next.replace(/[\s\r\n]/g, '').length === 0) return '';
  return ensureSingleTrailingNewline(next, eol);
}

// ---------- I/O: collect items ----------

async function pkgToItem(pkg: Pkg): Promise<ManagedItem> {
  let version: string | undefined;
  if (pkg.installedVersion) {
    const v = await pkg.installedVersion();
    if (v) version = v;
  }
  return {
    id: pkg.id,
    name: pkg.name,
    type: pkg.type,
    version,
    whenToUse: pkg.whenToUse,
    slashNamespace: pkg.slashNamespace,
  };
}

async function collectInstalledItems(): Promise<ManagedItem[]> {
  await Promise.all([listPlugins(true), listMcp(true)]);
  const items: ManagedItem[] = [];
  for (const pkg of PKGS) {
    if (await pkg.isInstalled()) {
      items.push(await pkgToItem(pkg));
    }
  }
  // Plugins first, then MCPs, alphabetic within group.
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'plugin' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return items;
}

// ---------- I/O: orchestration ----------

export async function syncClaudeMd(opts?: { skip?: boolean }): Promise<SyncResult> {
  const file = claudeMdPath();
  if (opts?.skip) return { status: 'skipped', path: file };
  try {
    const items = await collectInstalledItems();
    let existing = '';
    let existed = true;
    try {
      existing = await fs.readFile(file, 'utf8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        existed = false;
      } else {
        throw err;
      }
    }
    const eol: '\n' | '\r\n' = existing.includes('\r\n') ? '\r\n' : '\n';
    const hadBlock = BLOCK_RE.test(existing);
    let next: string;
    if (items.length === 0) {
      if (!hadBlock) {
        return { status: 'unchanged', path: file };
      }
      next = removeBlock(existing, eol);
    } else {
      next = upsertBlock(existing, renderBlock(items), eol);
    }
    if (next === existing) {
      return { status: 'unchanged', path: file };
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${process.pid}`;
    await fs.writeFile(tmp, next, 'utf8');
    await fs.rename(tmp, file);
    if (!existed) return { status: 'created', path: file };
    if (hadBlock && items.length === 0) return { status: 'removed', path: file };
    return { status: 'updated', path: file };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'failed', path: file, error: msg };
  }
}

// ---------- Convenience: call from flows after summarize() ----------

export async function syncFromState(opts?: { skip?: boolean }): Promise<void> {
  if (opts?.skip) {
    p.log.info(t('claudeMd.skipped'));
    return;
  }
  // Wrap in spinner — internally re-fires `claude plugin list --json` + `claude mcp list`
  // (force=true after install/uninstall busted the cache), so this can take 5-15s.
  const sp = p.spinner();
  sp.start(t('claudeMd.syncing'));
  const r = await syncClaudeMd();
  switch (r.status) {
    case 'skipped':
      sp.stop(t('claudeMd.skipped'));
      return;
    case 'unchanged':
      sp.stop(t('claudeMd.unchanged'));
      return;
    case 'created':
    case 'updated':
      sp.stop(t('claudeMd.synced', { path: r.path }));
      return;
    case 'removed':
      sp.stop(t('claudeMd.removed'));
      return;
    case 'failed':
      sp.stop(t('claudeMd.failed', { error: r.error ?? 'unknown' }));
      return;
  }
}

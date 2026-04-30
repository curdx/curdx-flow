import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as p from '@clack/prompts';
import { listPlugins, listMcp } from './state.ts';
import { PKGS } from '../registry/index.ts';
import type { Pkg } from '../registry/types.ts';
import { t } from '../i18n/index.ts';

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

function renderItemLine(item: ManagedItem): string {
  let line = `- ${item.name}`;
  if (item.version) line += ` (v${item.version})`;
  if (item.slashNamespace) line += ` — \`${item.slashNamespace}\``;
  if (item.whenToUse) line += ` — ${item.whenToUse}`;
  return line;
}

function buildCombinationPatterns(ids: Set<string>): string[] {
  const has = (k: string) => ids.has(k);
  const out: string[] = ['按场景串联，不要一个个孤立调用：', ''];

  // 新需求 / 新 feature
  if (has('claude-mem') || has('context7') || has('curdx-flow')) {
    out.push('- **接到新需求 / 新 feature 起手式**');
    let step = 1;
    if (has('claude-mem')) out.push(`  ${step++}. \`claude-mem:mem-search\` 查历史——"以前有没有类似的活/坑"`);
    if (has('context7')) out.push(`  ${step++}. 涉及外部库 → \`context7\` 拉最新文档`);
    const planners: string[] = [];
    if (has('claude-mem')) planners.push('`claude-mem:make-plan` 出 phased plan');
    if (has('curdx-flow')) planners.push('`/curdx-flow:new` 起 spec');
    if (planners.length > 0) out.push(`  ${step++}. 复杂多步 → ${planners.join('，或 ')}`);
    out.push(`  ${step++}. 简单一次性改动 → 直接动手，跳过上面几步`);
    out.push('');
  }

  // bug / 卡住
  const stuckLines: string[] = [];
  let s = 1;
  if (has('claude-mem')) stuckLines.push(`  ${s++}. 先看 \`claude-mem:mem-search\`——以前是否解过同样的 bug`);
  if (has('chrome-devtools-mcp')) stuckLines.push(`  ${s++}. 浏览器侧 bug → \`chrome-devtools-mcp\`（network / console / perf trace）`);
  if (has('context7')) stuckLines.push(`  ${s++}. 库 / API 行为不符预期 → \`context7\` 查官方 doc，不要凭记忆`);
  const stillStuck: string[] = [];
  if (has('sequential-thinking')) stillStuck.push('`sequential-thinking` 拆假设');
  if (has('pua')) stillStuck.push('`/pua:pua-loop` 自动迭代');
  if (stillStuck.length > 0) stuckLines.push(`  ${s++}. 还卡 → ${stillStuck.join('，或 ')}`);
  if (stuckLines.length > 0) {
    out.push('- **遇到 bug / 卡住 2 次以上**', ...stuckLines, '');
  }

  // UI
  if (has('frontend-design') || has('chrome-devtools-mcp')) {
    out.push('- **做 UI / 前端页面**');
    if (has('frontend-design')) out.push('  - `frontend-design` 自动 fire，无需手动调');
    if (has('chrome-devtools-mcp')) out.push('  - 渲染异常或交互 bug → `chrome-devtools-mcp` 验证，不靠肉眼');
    out.push('');
  }

  // 大型协作
  if (has('pua') || has('curdx-flow')) {
    out.push('- **大型 / 跨模块 / 多 agent 协作**');
    if (has('pua')) out.push('  - `/pua:p9` 拆 task prompt + 管 P8 团队');
    if (has('curdx-flow')) out.push('  - `/curdx-flow:triage` 把大 feature 拆成多个 spec');
    if (has('pua')) out.push('  - 战略级 → `/pua:p10`');
  }

  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

function buildSkipRules(ids: Set<string>): string[] {
  const has = (k: string) => ids.has(k);
  const out: string[] = [];
  out.push('- 一行改动 / typo / 重命名变量 —— 不要 plan，不要 mem-search，直接 Edit');
  const skips: string[] = [];
  if (has('pua')) skips.push('`/pua:pua`');
  if (has('sequential-thinking')) skips.push('`sequential-thinking`');
  if (skips.length > 0) {
    out.push(`- 已知确定的 fix —— 不要 ${skips.join('、')}`);
  }
  out.push('- 用户问"这是什么意思"类的解释题 —— 不调任何工具，直接答');
  if (has('curdx-flow')) {
    out.push('- 单文件局部重构 —— 不起 spec，不进 curdx-flow');
  }
  return out;
}

function buildDecisionTree(ids: Set<string>): string[] {
  const has = (k: string) => ids.has(k);
  const out: string[] = [];
  out.push('1. 能 1–2 步搞定？→ 直接做');
  out.push('2. 多步骤但路径清晰？→ TaskCreate 拆任务，不进 spec');
  const planners: string[] = [];
  if (has('curdx-flow')) planners.push('`/curdx-flow:new`');
  if (has('claude-mem')) planners.push('`claude-mem:make-plan`');
  if (planners.length > 0) {
    out.push(`3. 需求模糊 / 跨模块 / 要分阶段交付？→ ${planners.join(' 或 ')}`);
  }
  if (has('claude-mem')) {
    out.push('4. 同样的活以前可能干过？→ 先 `claude-mem:mem-search`');
  }
  return out;
}

export function renderBlock(items: ManagedItem[]): string {
  const installedIds = new Set(items.map((i) => i.id));
  const lines: string[] = [
    BEGIN_MARKER,
    '## Tool Usage',
    '',
    'Available tools/plugins:',
    ...items.map(renderItemLine),
  ];
  const combo = buildCombinationPatterns(installedIds);
  if (combo.length > 0) {
    lines.push('', '## Tool Combination Patterns（组合工作流）', '', ...combo);
  }
  const skip = buildSkipRules(installedIds);
  if (skip.length > 0) {
    lines.push('', '## Skip Rules（防过度工具化）', '', ...skip);
  }
  const tree = buildDecisionTree(installedIds);
  if (tree.length > 0) {
    lines.push('', '## Decision Tree（遇到模糊请求时）', '', ...tree);
  }
  lines.push('', 'Run `npx @curdx/flow` to install / update / uninstall.', END_MARKER);
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

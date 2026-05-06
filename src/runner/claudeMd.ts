import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as p from '@clack/prompts';
import { listPlugins, listMcp } from './state.ts';
import { PKGS } from '../registry/index.ts';
import type { Pkg } from '../registry/types.ts';
import { t } from '../i18n/index.ts';
import { getLang } from '../i18n/index.ts';

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

function isZh(): boolean {
  return getLang() === 'zh';
}

function buildCombinationPatterns(ids: Set<string>): string[] {
  const has = (k: string) => ids.has(k);
  const out: string[] = [
    isZh()
      ? '按场景串联，优先按能力边界调用：slash command、MCP、插件 skill 不要混写。'
      : 'Combine tools by capability. Keep slash commands, MCP tools, and plugin skills distinct.',
    '',
  ];

  if (has('claude-mem') || has('context7') || has('curdx-flow')) {
    out.push(isZh() ? '- **接到新需求 / 新 feature**' : '- **Starting a new feature**');
    let step = 1;
    if (has('claude-mem')) {
      out.push(
        isZh()
          ? `  ${step++}. 先用 \`/claude-mem:mem-search\` 查历史，确认之前有没有类似实现、踩坑或决策。`
          : `  ${step++}. Start with \`/claude-mem:mem-search\` to check whether this work, decision, or pitfall already exists in memory.`,
      );
    }
    if (has('context7')) {
      out.push(
        isZh()
          ? `  ${step++}. 涉及外部库、SDK、框架或 API 时，使用 Context7 MCP 拉官方最新文档。`
          : `  ${step++}. If external libraries, SDKs, frameworks, or APIs are involved, use the Context7 MCP to pull current official docs.`,
      );
    }
    const planners: string[] = [];
    if (has('claude-mem')) {
      planners.push(
        isZh()
          ? '`/claude-mem:make-plan` 产出分阶段计划'
          : '`/claude-mem:make-plan` for a phased plan',
      );
    }
    if (has('curdx-flow')) {
      planners.push(
        isZh()
          ? '`/curdx-flow:new` 或相关 spec flow 起完整规格'
          : '`/curdx-flow:new` or the spec flow for a full specification',
      );
    }
    if (planners.length > 0) {
      out.push(
        isZh()
          ? `  ${step++}. 多步骤、高不确定性、跨模块时，再进入 ${planners.join('，或 ')}。`
          : `  ${step++}. Only move into ${planners.join(' or ')} when the work is multi-step, cross-cutting, or uncertain.`,
      );
    }
    out.push(
      isZh()
        ? `  ${step++}. 简单、范围明确的一次性改动，直接做，不要先把流程拉满。`
        : `  ${step++}. For small, clear one-shot changes, implement directly instead of forcing the full workflow.`,
    );
    out.push('');
  }

  const stuckLines: string[] = [];
  let s = 1;
  if (has('claude-mem')) {
    stuckLines.push(
      isZh()
        ? `  ${s++}. 先用 \`/claude-mem:mem-search\` 查记忆，确认是不是以前解过同类 bug。`
        : `  ${s++}. Check \`/claude-mem:mem-search\` first to see whether the same bug was solved before.`,
    );
  }
  if (has('chrome-devtools-mcp')) {
    stuckLines.push(
      isZh()
        ? `  ${s++}. 浏览器侧问题使用 Chrome DevTools MCP：看 network、console、performance、DOM snapshot。`
        : `  ${s++}. For browser-side issues, use the Chrome DevTools MCP for network, console, performance, and DOM snapshots.`,
    );
  }
  if (has('context7')) {
    stuckLines.push(
      isZh()
        ? `  ${s++}. 如果怀疑是库 / API 行为变化，使用 Context7 MCP 查官方文档，不要凭记忆。`
        : `  ${s++}. If the issue may come from library or API behavior, use the Context7 MCP instead of relying on memory.`,
    );
  }
  const stillStuck: string[] = [];
  if (has('sequential-thinking')) {
    stillStuck.push(
      isZh() ? '使用 sequential-thinking MCP 拆假设' : 'use the sequential-thinking MCP to break down hypotheses',
    );
  }
  if (has('pua')) {
    stillStuck.push(
      isZh() ? '再进入 `/pua:pua-loop` 迭代' : 'then enter `/pua:pua-loop` for structured retries',
    );
  }
  if (stillStuck.length > 0) {
    stuckLines.push(
      isZh()
        ? `  ${s++}. 两轮以上仍卡住，再 ${stillStuck.join('，或 ')}。`
        : `  ${s++}. If you are still stuck after multiple attempts, ${stillStuck.join(' or ')}.`,
    );
  }
  if (stuckLines.length > 0) {
    out.push(isZh() ? '- **遇到 bug / 连续卡住**' : '- **Debugging and repeated failures**', ...stuckLines, '');
  }

  if (has('frontend-design') || has('chrome-devtools-mcp')) {
    out.push(isZh() ? '- **做 UI / 前端页面**' : '- **UI and frontend work**');
    if (has('frontend-design')) {
      out.push(
        isZh()
          ? '  - 优先使用 `frontend-design` 插件的 UI skills；若未自动触发，再显式调用对应 skill。'
          : '  - Prioritize the `frontend-design` plugin skills for UI work; if they do not trigger automatically, invoke the relevant skill explicitly.',
      );
    }
    if (has('chrome-devtools-mcp')) {
      out.push(
        isZh()
          ? '  - 渲染异常、交互问题或视觉回归，使用 Chrome DevTools MCP 验证，不要只靠肉眼猜。'
          : '  - For rendering issues, interaction bugs, or visual regressions, verify with the Chrome DevTools MCP instead of relying on visual guesswork alone.',
      );
    }
    out.push('');
  }

  if (has('pua') || has('curdx-flow')) {
    out.push(isZh() ? '- **大型 / 跨模块 / 多 agent 协作**' : '- **Large, cross-cutting, or multi-agent work**');
    if (has('pua')) {
      out.push(
        isZh()
          ? '  - 需要并行拆解与团队协作时，用 `/pua:p9`；更高层战略规划再考虑 `/pua:p10`。'
          : '  - Use `/pua:p9` for parallel task decomposition and team coordination; reserve `/pua:p10` for higher-level strategy work.',
      );
    }
    if (has('curdx-flow')) {
      out.push(
        isZh()
          ? '  - 一个大功能需要拆成多个相互依赖的规格时，使用 `/curdx-flow:triage`。'
          : '  - Use `/curdx-flow:triage` when one large feature needs to be split into multiple dependent specs.',
      );
    }
  }

  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

function buildSkipRules(ids: Set<string>): string[] {
  const has = (k: string) => ids.has(k);
  const out: string[] = [];
  out.push(
    isZh()
      ? '- 一行改动、typo、纯重命名变量：不要先 plan，不要先开 spec，直接改。'
      : '- For one-line changes, typos, or pure renames, skip planning and spec flow. Just make the edit.',
  );
  const skips: string[] = [];
  if (has('pua')) skips.push('`/pua:pua`');
  if (has('sequential-thinking')) skips.push('`sequential-thinking`');
  if (skips.length > 0) {
    out.push(
      isZh()
        ? `- 已知确定的 fix：不要先上 ${skips.join('、')}。`
        : `- For a known, deterministic fix, do not reach for ${skips.join(' or ')} first.`,
    );
  }
  out.push(
    isZh()
      ? '- 纯概念解释题可以直接答；如果是在问当前仓库里的代码含义，先读相关文件再解释。'
      : '- Answer pure conceptual explanation questions directly. If the question is about code in this repository, read the relevant files first.',
  );
  if (has('curdx-flow')) {
    out.push(
      isZh()
        ? '- 单文件局部重构或很小范围的整理：通常不要进入 curdx-flow spec 流。'
        : '- For a single-file refactor or a very local cleanup, usually do not enter the curdx-flow spec workflow.',
    );
  }
  return out;
}

function buildDecisionTree(ids: Set<string>): string[] {
  const has = (k: string) => ids.has(k);
  const out: string[] = [];
  out.push(isZh() ? '1. 能 1–2 步搞定？→ 直接做。' : '1. Can it be finished in 1-2 steps? -> Do it directly.');
  out.push(
    isZh()
      ? '2. 多步骤但路径清晰？→ 拆成简短任务列表逐个推进，不要默认进入完整 spec 流。'
      : '2. Is it multi-step but still clear? -> Break it into a short task list and execute without defaulting to the full spec flow.',
  );
  const planners: string[] = [];
  if (has('curdx-flow')) planners.push('`/curdx-flow:new`');
  if (has('claude-mem')) planners.push('`/claude-mem:make-plan`');
  if (planners.length > 0) {
    out.push(
      isZh()
        ? `3. 需求模糊、跨模块、需要分阶段交付？→ ${planners.join(' 或 ')}。`
        : `3. Is the request ambiguous, cross-cutting, or phase-based? -> ${planners.join(' or ')}.`,
    );
  }
  if (has('claude-mem')) {
    out.push(
      isZh()
        ? '4. 这类活以前可能做过？→ 先 `/claude-mem:mem-search`。'
        : '4. Might this work have been done before? -> Start with `/claude-mem:mem-search`.',
    );
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
    ['## Language Policy（语言规则）', buildLanguagePolicy()],
    [
      isZh() ? '## Tool Combination Patterns（组合工作流）' : '## Tool Combination Patterns',
      buildCombinationPatterns(installedIds),
    ],
    [isZh() ? '## Skip Rules（防过度工具化）' : '## Skip Rules', buildSkipRules(installedIds)],
    [isZh() ? '## Decision Tree（遇到模糊请求时）' : '## Decision Tree', buildDecisionTree(installedIds)],
  ];
  const lines: string[] = [BEGIN_MARKER];
  for (const [heading, body] of sections) {
    if (body.length === 0) continue;
    lines.push(heading, '', ...body, '');
  }
  lines.push(
    isZh()
      ? '运行 `npx @curdx/flow` 以 install / update / uninstall。'
      : 'Run `npx @curdx/flow` to install / update / uninstall.',
    END_MARKER,
  );
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

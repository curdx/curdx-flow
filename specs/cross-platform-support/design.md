# Design: cross-platform-support

## Overview

把 `plugins/curdx-flow/hooks/scripts/*.sh` 全量迁移到 TypeScript 源（`src/hooks/`），用 esbuild bundle 成单文件 ESM `.mjs` commit 进 `plugins/curdx-flow/hooks/scripts/`，hooks.json 切到 `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<name>.mjs"` 显式 invoke。同时 sweep 79 处 markdown 嵌入 jq/bash（14 node-oneliner / 45 extract-to-lib / 20 inline-prose），三平台 CI 矩阵 + vitest smoke test 兜底，v7.0.0 major bump 4-stage 预发布走 alpha → beta → rc → final。

> **CLAUDE.md 矛盾说明**：当前 CLAUDE.md 写"bundled plugin shipped as static files — no build step"。v7 将打破该陈述，需作为 v7.0.0 release 步骤的一部分同步更新 CLAUDE.md（File Plan 已收录 modify 项）。这是 design 决策的一部分而非 oversight。

---

## Architecture

```mermaid
flowchart TD
    subgraph SourceTier["源代码（git tracked, npm publish 不含）"]
        TS["src/hooks/*.ts<br/>5 个 hook + _shared/ + lib/"]
        BUILD["scripts/build-hooks.mjs<br/>(esbuild driver)"]
        FRESH["scripts/check-hooks-fresh.mjs<br/>(rebuild + git diff gate)"]
        TEST["tests/hooks/*.test.ts<br/>(vitest smoke)"]
    end

    subgraph BundledTier["产物层（git tracked + npm publish）"]
        PJSON["hooks/scripts/package.json<br/>{type:module}"]
        BMJS["hooks/scripts/*.mjs<br/>(5 hooks bundled)"]
        BLIB["hooks/scripts/lib/*.mjs<br/>(11-13 工具 bundled)"]
        HJSON["hooks/hooks.json<br/>(node + shell:bash + async)"]
    end

    subgraph Runtime["用户机器（Claude Code 运行时）"]
        CC["Claude Code"]
        BASH["bash -c (Git Bash / macOS / Linux)"]
        NODE["node 20.12+"]
        STDIN["stdin: JSON"]
        STDOUT["stdout: JSON"]
    end

    TS -->|tsup workspace 类型检查| BUILD
    BUILD -->|esbuild bundle| BMJS
    BUILD -->|esbuild bundle| BLIB
    BMJS -.同级.-> PJSON
    TS -->|spawn node bundle| TEST
    FRESH -->|invokes| BUILD

    HJSON -->|hook trigger| CC
    CC -->|exec via shell:bash| BASH
    BASH -->|node "${CLAUDE_PLUGIN_ROOT}/..."| NODE
    NODE -->|loads| BMJS
    NODE -.imports.-> BLIB
    STDIN --> NODE
    NODE --> STDOUT

    style BundledTier fill:#e8f4ea
    style Runtime fill:#fef3e8
```

**关键链路**：`src/hooks/<x>.ts` ──esbuild──> `plugins/curdx-flow/hooks/scripts/<x>.mjs` ──hooks.json──> `node …/<x>.mjs` ──stdin JSON──> hook 逻辑 ──stdout JSON──> Claude Code 消费。

---

## Component Catalog

### Hook entrypoints (5 个，1:1 移植)

| 组件 | 路径 | 职责 | 依赖 | 上游 .sh |
|------|------|------|------|---------|
| load-spec-context | `src/hooks/load-spec-context.ts` | SessionStart：解析 cwd 找 active spec，输出 context block | `_shared/stdin`, `_shared/path-resolver` | `load-spec-context.sh` (110 LOC) |
| quick-mode-guard | `src/hooks/quick-mode-guard.ts` | PreToolUse:AskUserQuestion：检查 quickMode 状态决定 deny/allow | `_shared/stdin`, `_shared/path-resolver` | `quick-mode-guard.sh` (47 LOC) |
| stop-watcher | `src/hooks/stop-watcher.ts` | Stop：解析 transcript 检 ALL_TASKS_COMPLETE，更新 epic state，原子写入 | `_shared/stdin`, `_shared/atomic-write`, `_shared/markdown-task-parser`, `_shared/path-resolver` | `stop-watcher.sh` (362 LOC，含 awk 状态机) |
| update-spec-index | `src/hooks/update-spec-index.ts` | 手动触发：扫所有 spec 生成 index.json | `_shared/path-resolver`, `lib/count-tasks` | `update-spec-index.sh` (275 LOC) |
| ~~path-resolver~~ | (移到 _shared) | ES module export 被多 hook import | — | `path-resolver.sh` (252 LOC, source 共享 lib) |

### Shared utilities (_shared/)

| 组件 | 路径 | 职责 |
|------|------|------|
| stdin | `src/hooks/_shared/stdin.ts` | `readStdinJson()` async iterator，统一替换 jq stdin 解析 |
| path-resolver | `src/hooks/_shared/path-resolver.ts` | 仓内任意 cwd → spec 路径解析；多 specs_dirs 检索；ES module export |
| atomic-write | `src/hooks/_shared/atomic-write.ts` | `writeFileAtomic(path, data)` = writeFileSync(temp) + renameSync（替代 mktemp + mv） |
| markdown-task-parser | `src/hooks/_shared/markdown-task-parser.ts` | 手写 regex + 状态机替代 awk 任务块提取（按 task index 提取 markdown 段） |

### Lib utilities (来自 markdown 45 处 extract-to-lib 归并，bundled 独立 .mjs，11 个)

| Lib 工具 | 路径 | 职责 | 谁调用（markdown 命令） |
|---------|------|------|----------------------|
| count-tasks | `src/hooks/lib/count-tasks.ts` | 数 spec/tasks.md 任务数 + completion | `templates/tasks.md`、`commands/status.md` |
| merge-state | `src/hooks/lib/merge-state.ts` | 合并 .curdx-state.json 字段（替代 jq `.field = val`） | `templates/tasks.md`、`agents/task-planner.md` |
| cleanup-files | `src/hooks/lib/cleanup-files.ts` | 删除 mock/scaffold/tmp 文件（cleanup 阶段） | `commands/implement.md` |
| ensure-gitignore | `src/hooks/lib/ensure-gitignore.ts` | 幂等加 entry 到 .gitignore | `commands/implement.md`、`templates/tasks.md` |
| search-files | `src/hooks/lib/search-files.ts` | grep 替代：跨平台文件 + 内容搜（fs.readdir + RegExp） | `agents/task-planner.md`（多处） |
| count-mocks | `src/hooks/lib/count-mocks.ts` | 数测试文件中 mock 占比（reality-verification） | `templates/tasks.md`、reality-verification skill |
| get-default-branch | `src/hooks/lib/get-default-branch.ts` | 跨平台 git 默认 branch 探测（替代 `git symbolic-ref` + sed） | `commands/implement.md` |
| kill-port | `src/hooks/lib/kill-port.ts` | 跨平台 lsof + kill 替代（Windows 用 `netstat` / `taskkill`） | `commands/implement.md`（2 处 lsof） |
| update-modification-map | `src/hooks/lib/update-modification-map.ts` | 维护 .file-modifications.json（task → files） | `agents/task-planner.md` |
| update-fix-task-map | `src/hooks/lib/update-fix-task-map.ts` | 维护 fix-task 映射 state | `commands/implement.md` |
| init-execution-state | `src/hooks/lib/init-execution-state.ts` | 初始化 .curdx-state.json from template | `commands/start.md` |

> **延后到 tasks 决策**：`get-fix-attempts` 与 `mark-task-complete` 是否合并进 `merge-state` / `update-fix-task-map`，留 tasks 阶段决断（jobs-to-be-done 视角）。当前 catalog 11 个，可能压缩到 9-10。

### Build / test 基础设施

| 组件 | 路径 | 职责 |
|------|------|------|
| build-hooks driver | `scripts/build-hooks.mjs` | 扫 `src/hooks/*.ts` + `src/hooks/lib/*.ts` → esbuild bundle → `plugins/.../scripts/*.mjs` |
| check-hooks-fresh gate | `scripts/check-hooks-fresh.mjs` | 跑 build-hooks → `git diff --exit-code plugins/curdx-flow/hooks/scripts/`；非零退出 |
| smoke tests | `tests/hooks/<name>.test.ts` | spawn `node bundle.mjs` 喂 stdin fixture 断 stdout/exit |
| fixtures | `tests/hooks/fixtures/<hook>/<scenario>.json` | stdin JSON 样本（happy/edge/error 各一） |
| vitest config | `vitest.config.ts` | test runner 配置 |

---

## Build Pipeline

### esbuild 配置（`scripts/build-hooks.mjs` 核心片段）

```js
import { build } from 'esbuild';
import { glob } from 'node:fs/promises';
import path from 'node:path';

const HOOK_ENTRIES = [
  'src/hooks/load-spec-context.ts',
  'src/hooks/quick-mode-guard.ts',
  'src/hooks/stop-watcher.ts',
  'src/hooks/update-spec-index.ts',
];
const LIB_ENTRIES = await collectGlob('src/hooks/lib/*.ts');

const BANNER = `
import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);
`.trim();

await build({
  entryPoints: [...HOOK_ENTRIES, ...LIB_ENTRIES],
  outdir: 'plugins/curdx-flow/hooks/scripts',
  outbase: 'src/hooks',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'bundle',
  outExtension: { '.js': '.mjs' },
  banner: { js: BANNER },
  treeShaking: true,
  sourcemap: 'linked',
  minify: false,        // readable for plugin auditability
  logLevel: 'info',
});
```

### npm scripts (package.json 增改)

| Script | Command | 说明 |
|--------|---------|------|
| `build` | `tsup && node scripts/build-hooks.mjs` | 聚合 CLI + hooks（**改**） |
| `build:cli` | `tsup` | 单独 CLI build（**新**） |
| `build:hooks` | `node scripts/build-hooks.mjs` | 单独 hooks build（**新**） |
| `check:hooks-fresh` | `node scripts/check-hooks-fresh.mjs` | rebuild + git diff gate（**新**） |
| `test:hooks` | `vitest run tests/hooks` | smoke 套件（**新**） |
| `verify` | `npm run typecheck && npm run check-versions && npm run check:hooks-fresh && npm run test:hooks` | 一键全验（**新**） |
| `prepublishOnly` | `node scripts/check-versions.mjs && npm run typecheck && npm run check:hooks-fresh && npm run build` | check:hooks-fresh 加入链（**改**） |

---

## hooks.json 改造前后对比

```yaml
# v6 (当前)
PreToolUse[AskUserQuestion]:
  command: "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/quick-mode-guard.sh"
  timeout: 10
Stop:
  command: "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/stop-watcher.sh"
SessionStart:
  command: "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/load-spec-context.sh"

# v7 (新)
PreToolUse[AskUserQuestion]:
  command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/quick-mode-guard.mjs"'
  shell: bash
  timeout: 10
Stop:
  command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/stop-watcher.mjs"'
  shell: bash
SessionStart:
  command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/load-spec-context.mjs"'
  shell: bash
  async: true   # mitigation for GH#34457 Windows event-loop deadlock
```

变化点：（1）显式 `node` 前缀绕过 exec-bit 与 `.mjs` MIME；（2）双引号包 `${CLAUDE_PLUGIN_ROOT}` 防 path-with-space；（3）显式 `shell: bash` 避免 PowerShell 误派；（4）SessionStart 加 `async: true`。

---

## Markdown Sweep 实现策略

### 14 处 node-oneliner（直接 inline 替换）

例 1（`templates/tasks.md`，jq 读 scripts 字段）：
```bash
# v6
jq '.scripts' package.json

# v7
node -e "console.log(JSON.stringify(JSON.parse(require('node:fs').readFileSync('package.json','utf8')).scripts,null,2))"
```

例 2（`commands/implement.md`，jq 写 state field）：
```bash
# v6
jq '.taskIndex = 5' .curdx-state.json > tmp && mv tmp .curdx-state.json

# v7
node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/merge-state.mjs" .curdx-state.json '{"taskIndex":5}'
```

> 阈值规则：单行 jq + ≤ 80 字符 stdin 解析 → node-oneliner；其余 → extract-to-lib。

### 45 处 extract-to-lib（按 lib 工具映射）

| Markdown 调用点（来源） | 映射 lib | 计数 |
|------------------------|---------|------|
| state 字段读写（jq `.field = val`） | `lib/merge-state.mjs` | ~14 |
| 任务计数（jq + grep 联合） | `lib/count-tasks.mjs` | ~6 |
| 文件清扫（cleanup phase） | `lib/cleanup-files.mjs` | ~3 |
| .gitignore 幂等增项 | `lib/ensure-gitignore.mjs` | ~2 |
| 跨目录 grep | `lib/search-files.mjs` | ~8 |
| mock 占比统计 | `lib/count-mocks.mjs` | ~3 |
| git 默认 branch | `lib/get-default-branch.mjs` | ~2 |
| 端口清理（lsof+kill） | `lib/kill-port.mjs` | ~2 |
| 修改映射 | `lib/update-modification-map.mjs` | ~3 |
| fix-task 映射 | `lib/update-fix-task-map.mjs` | ~1 |
| state 初始化 | `lib/init-execution-state.mjs` | ~1 |
| **合计** | | **45** |

调用形式统一为 `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/<x>.mjs" <args>`。

### 20 处 inline-prose（仅说明用，无可执行 token）

例：`agents/task-planner.md` 中"用 `jq '.tasks | length'` 数任务" → "数 `tasks.md` 中 `## Task` 段落数（参考 `lib/count-tasks.mjs`）"。Sweep 验收：`grep -rn '\bjq\b' plugins/curdx-flow` = 0。

---

## Cross-Platform Path Handling

| 场景 | API | 说明 |
|------|-----|------|
| 用户路径（fs IO） | `path.join`, `path.resolve` | 平台原生分隔符 |
| Spec 路径序列化（state file 内） | `path.posix.join` | 跨平台 stable，避免 `\\` 转义地狱 |
| Repo-relative path 输出（context block） | `path.posix.join` | byte-equal 保证 |
| 临时目录 | `os.tmpdir()` | 不写死 `/tmp` |
| Home 目录 | `os.homedir()` | 不读 `$HOME` |
| File mtime | `fs.statSync(p).mtimeMs` | 统一 ms（v6 macOS 用 `stat -f %m` 给 sec，是预知的精度变化） |
| 原子写入 | `fs.writeFileSync(tmp, data); fs.renameSync(tmp, dst)` | Windows 同卷 rename 是原子操作（NTFS MoveFile） |
| 行结束符 | 写文件统一 `\n`（不依赖 `os.EOL`） | 配合 `.gitattributes` LF pin |

**.gitattributes（仓根新建）**：
```
*.sh   text eol=lf
*.mjs  text eol=lf
*.cjs  text eol=lf
*.js   text eol=lf
```

---

## Stdin/Stdout Contract

### `_shared/stdin.ts`

```ts
export async function readStdinJson<T = unknown>(): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {} as T;  // 空 stdin 容忍
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    process.stderr.write(`[hook] invalid stdin JSON: ${(e as Error).message}\n`);
    process.exit(0);  // 不阻塞 Claude session
  }
}
```

### Hook stdout 格式

遵循 Anthropic hook spec：JSON object，常见字段 `decision: "allow"|"deny"`、`reason: string`、`additionalContext: string`、`continue: boolean`。错误路径：写 stderr + `process.exit(0)`（NOT 1，避免阻塞会话）。

### 错误处理矩阵

| 输入 | 行为 |
|------|------|
| 非法 JSON stdin | stderr log + exit 0（不阻塞） |
| 空 stdin | 当作空 object，按默认逻辑走 |
| 缺字段（cwd 等） | fallback `process.cwd()`，stderr warn |
| timeout（hook 自身） | hooks.json 已有 `timeout: 10`，Claude Code 兜底 |

---

## Failure Modes & Graceful Degradation

| 场景 | 行为 | 用户感知 |
|------|------|---------|
| Hook crash（throw） | global try/catch + stderr log + exit 0 | 会话继续，不见 context block |
| State file 损坏 | 输出 `{"reason": "state corrupted, recovery needed"}` | 用户看到提示自查 |
| Transcript 不存在 | 跳过解析，输出 `{"continue": true}` | 多任务循环不挂 |
| jq missing | **不再是失败模式**（依赖已消除） | — |
| Node missing | hooks.json `node` 命令找不到 → bash 报 command not found | 用户必须装 Node 20.12+；MIGRATION 文档显式 |
| `CLAUDE_PLUGIN_ROOT` unset (#27145) | bash 把变量展开为空 → `node "/hooks/scripts/x.mjs"` 报 ENOENT | **不写 bash 兜底**；alpha 阶段实测最低支持 Claude Code 版本是否仍存在该 bug；存在则在 beta 加 `[ -n "${CLAUDE_PLUGIN_ROOT}" ] || ...` 4 行兜底 |

---

## Test Strategy

### vitest.config.ts（新建）

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/hooks/**/*.test.ts'],
    testTimeout: 5000,
    pool: 'forks',  // 隔离 spawn 子进程
  },
});
```

### 测试方式（spawn bundled .mjs，不直接 import .ts）

```ts
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function runHook(bundlePath: string, fixture: object) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
    const proc = spawn('node', [bundlePath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => stdout += d);
    proc.stderr.on('data', (d) => stderr += d);
    proc.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    proc.stdin.write(JSON.stringify(fixture));
    proc.stdin.end();
  });
}
```

### Fixture 目录

```
tests/hooks/fixtures/
  load-spec-context/
    happy.json        # 仓内 cwd + 有 active spec
    no-spec.json      # 仓内 cwd + 无 spec
    outside-repo.json # cwd 在仓外
  quick-mode-guard/
    quick-mode.json   # state.quickMode = true → deny
    normal.json       # state.quickMode = false → allow
    no-state.json     # state file 不存在 → allow
  stop-watcher/
    all-complete.json
    in-progress.json
    transcript-missing.json
  update-spec-index/
    multi-spec.json
    empty.json
```

每个 hook 至少 3 fixture（happy / edge / error），lib 工具每个至少 1 单元测试。

### Byte-equal regression test

`tests/hooks/byte-equal.test.ts`：
- 在 macOS+Linux runner 跑（Windows 跳过——已声明 path separator + mtime 允许差异）
- 输入：固定 fixture
- 期望：v7 stdout strip path-separator + mtime field 后与 v6.0.6 baseline snapshot byte-equal
- baseline snapshot 生成：checkout `v6.0.6` tag → 跑 .sh hook → 存 `tests/hooks/baselines/v6.0.6/<hook>/<fixture>.txt`
- 比较时统一规范化：`output.replace(/\\/g, '/').replace(/"mtime":\d+/g, '"mtime":<NUM>')`

---

## CI 矩阵设计

### `.github/workflows/ci.yml` 改造（关键片段）

```yaml
name: CI
on: [push, pull_request]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run typecheck

  check-fresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run check:hooks-fresh

  test-matrix:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: ['20', '22']
        # 优化：Linux 跑 20+22；macOS+Windows 各只跑 22（cost vs coverage）
        exclude:
          - { os: macos-latest, node: '20' }
          - { os: windows-latest, node: '20' }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }}, cache: 'npm' }
      - run: npm ci
      - run: npm run build:hooks
      - run: npm run test:hooks

  all-green:
    runs-on: ubuntu-latest
    needs: [typecheck, check-fresh, test-matrix]
    steps:
      - run: echo "All checks passed"
```

矩阵 leg 数：1（typecheck）+ 1（check-fresh）+ 4（2 ubuntu + 1 macos + 1 windows）= **6 jobs**（vs 朴素 9 leg 节省 1/3）。

### `.github/workflows/release.yml` 触发链

**选 `workflow_run` 模式**（理由：tag 在 main 上推后，CI 已在 main 上跑过；release.yml 只需确认该 commit CI 全绿即可，不必重跑矩阵）：

```yaml
name: Release
on:
  workflow_run:
    workflows: ['CI']
    types: [completed]
    branches: ['main']

jobs:
  release:
    if: |
      github.event.workflow_run.conclusion == 'success' &&
      startsWith(github.event.workflow_run.head_branch, 'refs/tags/v')
    runs-on: ubuntu-latest
    # ...原有 npm publish + GH release 步骤
```

**为什么 workflow_run 优于 `needs: ci`**：tag push 触发 release.yml 时，CI workflow 是平行触发的，`needs:` 只能链接同 workflow 内 jobs。`workflow_run` 让 release 等 CI 完成后再跑，且能读 `conclusion` 字段判断成败。代价：release 延迟 ~15 分钟（CI 跑完时间）。

---

## Release 节奏（pre-release plan）

| 阶段 | 版本 | npm dist-tag | 受众 | 验收 gate |
|------|------|-------------|------|----------|
| 1 | `v7.0.0-alpha.0` | `alpha` | 维护者 + ~3 名 Windows 早期用户 | 三平台 CI 全绿 + Windows 实测 SessionStart 不死锁 + #267 验证 |
| 2 | `v7.0.0-beta.0` | `beta` | 公开 beta，README 加广播 | 至少 1 名外部用户跑通完整 spec 流程；byte-equal 测试 vs v6.0.6 通过 |
| 3 | `v7.0.0-rc.0` | `rc` | RC，文档 freeze | MIGRATION-V7.md review 通过；CHANGELOG.md 完成；2 周无 critical issue |
| 4 | `v7.0.0` | `latest` | 正式发布 | 所有 11 user stories AC 验收；NFR 全达标 |

用户安装路径：
- Alpha：`npx @curdx/flow@alpha`（不会被默认 `npx @curdx/flow` 拉到）
- Beta：`npx @curdx/flow@beta`
- 正式：`npx @curdx/flow`（latest tag 自动指 7.0.0）

发布命令（参考 npm SOP）：`npm publish --tag alpha --provenance --access public`。

---

## Migration Documentation Outline (`docs/MIGRATION-V7.md`)

```markdown
# Migration Guide: v6 → v7

## TL;DR
- 装 v7：`npx @curdx/flow@7` 或 `npm i -g @curdx/flow@7`
- Node 20.12+ 必须；jq 不再需要
- hooks.json 命令格式变了；如果你 fork 了 .sh，请改用 .mjs

## What broke (BREAKING)
1. hooks.json command 格式
2. .sh 全删（git 历史在 v6.0.6 tag）
3. Node 20.12+ requirement
4. jq 卸载（markdown 命令也变了）

## Why
（短理由：Windows + 三平台覆盖）

## Step-by-step upgrade
### From v6.0.x
1. npm/installer upgrade
2. claude plugin update curdx-flow
3. 验证 hook 跑通（命令）

### Custom .sh fork users
（替代方案 + sample）

## Downgrade path
`npx @curdx/flow@6.0.6` 或 plugin pin

## FAQ
- Q: 我不想装 Node? → 用 v6.0.6
- Q: macOS 行为变了? → 见 byte-equal 排除清单
- Q: Windows 还有问题? → issue tracker

## Verification checklist
（用户自查清单）
```

---

## Risk Register

| # | 风险 | 概率 | 影响 | Mitigation | Fallback |
|---|------|------|------|-----------|---------|
| R1 | Issue #267 .mjs MODULE_NOT_FOUND on Windows | M | High（hook 全挂） | colocated `package.json {"type":"module"}` + alpha 阶段 Windows 实测 | 切到 `.cjs` + `outExtension: { '.js': '.cjs' }` + 牺牲 top-level await |
| R2 | Windows event-loop deadlock 残留 | L | High | `async: true` for SessionStart + Windows runner P95 测量 | 拉 5 分钟 timeout 上限 + issue 报给 Anthropic |
| R3 | `CLAUDE_PLUGIN_ROOT` unset on SessionStart (#27145) | L-M | Medium | alpha 阶段实测最低支持 Claude Code 版本 | beta 加 4 行 bash 兜底（`[ -n "${CLAUDE_PLUGIN_ROOT}" ] || CLAUDE_PLUGIN_ROOT="$(...)"`） |
| R4 | mtime 精度 sec → ms 打破下游消费者 | L | Low | byte-equal 测试 ignore mtime field | doc 显式声明该 behavior change |
| R5 | byte-equal 测试因时间戳 flaky | M | Low | 规范化函数 strip path sep + mtime；fixture 不含 wall-clock | mock `Date.now()` if 必要 |
| R6 | 79 处 markdown sweep 漏 1-2 处 | M | Low | 验收 `grep -rn '\bjq\b' plugins/curdx-flow` = 0 是 hard gate | tasks 阶段加 grep CI check |
| R7 | esbuild bundle 在 Node 20 LTS 上 banner shim 失效 | L | Medium | banner 用最 conservative 写法（createRequire + fileURLToPath） | 退回到 `import.meta.dirname` 但 require Node 20.11+ |
| R8 | stop-watcher awk → regex 状态机翻译错误 | M | High（state 错） | 1:1 fixture 测试 v6 vs v7 输出 byte-equal | 加 markdown AST 解析作为 fallback impl（remark-parse） |
| R9 | CLAUDE.md 矛盾未同步更新 | L | Low | File Plan 已收录 modify CLAUDE.md | release SOP 列入 checklist |

---

## File Plan

| 操作 | 路径 | 说明 |
|------|------|------|
| create | `src/hooks/load-spec-context.ts` | TS 源（移植 .sh） |
| create | `src/hooks/quick-mode-guard.ts` | TS 源 |
| create | `src/hooks/stop-watcher.ts` | TS 源（含 awk → regex 状态机） |
| create | `src/hooks/update-spec-index.ts` | TS 源 |
| create | `src/hooks/_shared/stdin.ts` | async iterator stdin reader |
| create | `src/hooks/_shared/path-resolver.ts` | path-resolver.sh 移植，ES module export |
| create | `src/hooks/_shared/atomic-write.ts` | mktemp + rename 替代 |
| create | `src/hooks/_shared/markdown-task-parser.ts` | awk 状态机替代 |
| create | `src/hooks/lib/{count-tasks,merge-state,cleanup-files,ensure-gitignore,search-files,count-mocks,get-default-branch,kill-port,update-modification-map,update-fix-task-map,init-execution-state}.ts` | 11 lib 工具源 |
| create | `scripts/build-hooks.mjs` | esbuild driver |
| create | `scripts/check-hooks-fresh.mjs` | rebuild + git diff gate |
| create | `plugins/curdx-flow/hooks/scripts/package.json` | `{"type":"module"}` colocated |
| create | `plugins/curdx-flow/hooks/scripts/{load-spec-context,quick-mode-guard,stop-watcher,update-spec-index}.mjs` | 4 bundled hooks（path-resolver 内联进各 hook） |
| create | `plugins/curdx-flow/hooks/scripts/lib/*.mjs` | 11 bundled lib 工具 |
| create | `plugins/curdx-flow/hooks/scripts/*.mjs.map` | sourcemaps |
| create | `tests/hooks/<hook>.test.ts` | 4 hook smoke 套件 |
| create | `tests/hooks/lib/<lib>.test.ts` | 11 lib 单测 |
| create | `tests/hooks/fixtures/**/*.json` | stdin fixtures |
| create | `tests/hooks/baselines/v6.0.6/**/*.txt` | byte-equal baseline snapshot |
| create | `tests/hooks/byte-equal.test.ts` | regression 套件 |
| create | `vitest.config.ts` | runner 配置 |
| create | `.gitattributes` | LF eol pin（仓根） |
| create | `docs/MIGRATION-V7.md` | 迁移文档 |
| modify | `plugins/curdx-flow/hooks/hooks.json` | command 改 `node "..."`，加 `shell: bash`，SessionStart 加 `async: true` |
| modify | `package.json` | 新增 4 scripts + 改 build/prepublishOnly + dev deps（esbuild、vitest） |
| modify | `tsconfig.json` | include `src/hooks/**/*.ts`、`tests/**/*.ts` |
| modify | `.github/workflows/ci.yml` | typecheck + check-fresh + test-matrix（OS × Node）+ all-green |
| modify | `.github/workflows/release.yml` | `workflow_run` 触发链 |
| modify | `CHANGELOG.md` | v7.0.0 entry，含 `### Breaking` 段引用 MIGRATION-V7.md |
| modify | `CLAUDE.md` | 更新"plugin has no build step"段为 v7 的新 build pipeline 描述 |
| modify | `scripts/check-versions.mjs` | 适配 v7（如需）；5 字段保持不变 |
| delete | `plugins/curdx-flow/hooks/scripts/load-spec-context.sh` | git 历史 v6.0.6 保底 |
| delete | `plugins/curdx-flow/hooks/scripts/path-resolver.sh` | 同上 |
| delete | `plugins/curdx-flow/hooks/scripts/quick-mode-guard.sh` | 同上 |
| delete | `plugins/curdx-flow/hooks/scripts/stop-watcher.sh` | 同上 |
| delete | `plugins/curdx-flow/hooks/scripts/update-spec-index.sh` | 同上 |
| delete | `plugins/curdx-flow/hooks/scripts/test-path-resolver.sh` | 同上（替代品 = vitest） |
| delete | `plugins/curdx-flow/hooks/scripts/test-multi-dir-integration.sh` | 同上 |

---

## Open for Tasks Phase

下列子决策延后到 `/curdx-flow:tasks`，按优先序列入：

1. **Lib 工具粒度收敛**：11 catalog 是否压缩到 9-10（`get-fix-attempts` 是否合并进 `merge-state`；`mark-task-complete` 是否合并进 `update-fix-task-map`）—— 需走 jobs-to-be-done 视角再判
2. **Fixture 创建顺序**：先 happy path 还是先 error path？建议 happy 先（解锁 byte-equal baseline 生成）→ edge → error
3. **Byte-equal baseline 生成方式**：手动 checkout v6.0.6 跑 .sh vs CI 一次性生成存 git LFS？建议手动 + commit 进仓（baseline 永不变）
4. **Markdown sweep 79 处的批次**：按文件 hot-list（templates/tasks.md 13、agents/task-planner.md 11、commands/implement.md 6 = 30 处占 38%）优先 → 解锁早期 lib 验证
5. **Stop-watcher awk → regex 翻译**：是否用 TDD（先写 fixture + 期望 → 反推 regex 状态机）—— 强烈建议
6. **Version bump 时机**：是 design 完后立刻 bump 7.0.0-alpha.0 跑 CI？还是 task 都做完再 bump？建议先 bump alpha.0 的 git tag 让 CI 跑通——再追加 commit
7. **Pre-release 验收人**：alpha.0 的 ~3 名 Windows 用户从哪招募（issue tracker / 维护者群 / Discord）—— tasks 阶段定
8. **删除 .sh 的提交时机**：与新 .mjs 同 commit 还是分开？建议分开——便于 revert
9. **CHANGELOG.md v7.0.0 entry 在哪个阶段写**：建议 rc.0 时定稿，alpha/beta 阶段用 placeholder

---

Run `/curdx-flow:tasks`

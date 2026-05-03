# Requirements: cross-platform-support

## Goal

把 curdx-flow 插件从 bash+jq 工具链迁到 Node `.mjs` bundle，让 Windows/macOS/Linux 三平台用户都能正常用 hook 与所有 slash command，零额外运行时依赖（仅需 Node 20.12+）。

---

## User Stories

### US-1: Windows 用户启动会话不死锁

**As a** Windows 用户（Git Bash）
**I want to** 运行 `claude` 进入仓库后 SessionStart hook 立刻完成
**So that** 不出现"bad interpreter"或 5 分钟死锁

**Acceptance Criteria:**
- [ ] AC-1.1: Windows runner 上 SessionStart hook 注册并执行成功（exit 0）
- [ ] AC-1.2: 不输出 `bad interpreter`、`No such file or directory`、`/bin/bash^M`
- [ ] AC-1.3: P95 wall time < 200ms（Windows runner，干净 cwd 测量）
- [ ] AC-1.4: stdout 仍输出有效的 spec context block（与 v6 在 Linux 上的输出 string-equal，仅 path separator 差异允许）

### US-2: Windows 用户触发 quick-mode-guard 不报 jq missing

**As a** Windows 用户
**I want to** 触发 `PreToolUse:AskUserQuestion` 时 quick-mode-guard 正确决定 allow/deny
**So that** 工作流不被 `jq: command not found` 中断

**Acceptance Criteria:**
- [ ] AC-2.1: Windows 上喂 quick-mode + non-quick-mode 两种 fixture，行为分别为 deny / allow
- [ ] AC-2.2: 输出 JSON schema 与 v6 完全一致（`decision`、`reason` 字段）
- [ ] AC-2.3: 不调用任何 jq/bash 子进程
- [ ] AC-2.4: P95 < 100ms（Windows runner）

### US-3: Windows 用户 Stop hook 解析 transcript 正确

**As a** Windows 用户
**I want to** 会话 Stop 时 stop-watcher 读 transcript、判 ALL_TASKS_COMPLETE、产 continuation block
**So that** 多任务循环不丢状态

**Acceptance Criteria:**
- [ ] AC-3.1: 喂含 `ALL_TASKS_COMPLETE` 的 transcript fixture，输出 `{"continue": false}`-类的终止信号
- [ ] AC-3.2: 喂未完成 transcript fixture，输出含 next-task continuation block
- [ ] AC-3.3: 跨平台 file mtime 正确（替代 `stat -f %m` / `stat -c %Y` OS 分支）
- [ ] AC-3.4: epic state 文件原子写入（无半写入文件）
- [ ] AC-3.5: P95 < 500ms（Windows runner）

### US-4: Linux/macOS 老用户升级行为等价

**As a** v6 老用户（Linux/macOS）
**I want to** 升级到 v7 后所有命令、hook 输出与 v6 等价
**So that** 不丢功能、不破坏既有 spec 目录

**Acceptance Criteria:**
- [ ] AC-4.1: 5 个 hook 在 Linux+macOS 喂同一 fixture，stdout 与 v6 byte-equal（path separator 与 mtime 字段允许差异）
- [ ] AC-4.2: 已有 `specs/<name>/` 目录的 spec 不被破坏
- [ ] AC-4.3: 所有 v6 slash command 在 v7 仍可用

### US-5: 贡献者 PR 三平台 CI 验证

**As a** 贡献 hook 改动的开发者
**I want to** PR push 后在 windows-latest / macos-latest / ubuntu-latest 三矩阵跑 smoke test
**So that** 任一平台挂红就 block merge

**Acceptance Criteria:**
- [ ] AC-5.1: `.github/workflows/ci.yml` 含 `os: [ubuntu-latest, macos-latest, windows-latest]` 矩阵
- [ ] AC-5.2: 每个 hook 至少有 1 条 smoke test（stdin fixture → 断言 exit code + stdout）
- [ ] AC-5.3: 矩阵任一 leg 失败 → CI 整体红
- [ ] AC-5.4: release.yml 在 ci.yml 全绿前不可触发

### US-6: rebuild gate 防止源-产物漂移

**As a** 改了 `src/hooks/*.ts` 忘 rebuild 的开发者
**I want to** CI 自动检测 bundled `.mjs` 与源不同步
**So that** 漂移在 PR 阶段就被挡住

**Acceptance Criteria:**
- [ ] AC-6.1: CI 跑 `npm run check:hooks-fresh` (build + `git diff --exit-code plugins/curdx-flow/hooks/scripts/`)
- [ ] AC-6.2: 源改了但产物未 rebuild → CI 红 + 明确报错信息

### US-7: 新用户零额外依赖安装

**As a** 新用户
**I want to** 装 v7 后 hook 立刻能跑
**So that** 不需要装 jq、不需要装 bash 之外的工具

**Acceptance Criteria:**
- [ ] AC-7.1: README/MIGRATION 显式声明：唯一依赖 = Node ≥ 20.12.0
- [ ] AC-7.2: 在 PATH 无 jq 的 Windows runner 上 hook 全绿
- [ ] AC-7.3: 用户机器上 bundled `.mjs` 自包含、无需 `npm install`

### US-8: Markdown 中嵌入命令跨平台可执行

**As a** 读 plugin 内 commands/agents/references markdown 的用户
**I want to** 文档里所有 bash/jq 片段都被替换成 Node one-liner 或 lib 调用
**So that** 命令在 Windows Git Bash 直接可执行

**Acceptance Criteria:**
- [ ] AC-8.1: `grep -rn '\bjq\b' plugins/curdx-flow` 输出 0 行
- [ ] AC-8.2: 14 处 inline 命令已转 `node -e '...'` one-liner
- [ ] AC-8.3: 45 处复杂逻辑已抽到 `hooks/scripts/lib/` 共享 lib，markdown 改 `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/<x>.mjs"` 调用
- [ ] AC-8.4: 20 处仅说明用的命令已改 inline-prose 描述（无可执行 token）

### US-9: 升级用户能找到迁移指南

**As a** v6 → v7 升级用户
**I want to** 一份明确的 BREAKING CHANGE 列表 + 升级步骤
**So that** 知道为什么 break、按几步走能升完

**Acceptance Criteria:**
- [ ] AC-9.1: `docs/MIGRATION-V7.md` 存在
- [ ] AC-9.2: 文档列出所有 BREAKING CHANGE（hooks.json 命令格式、jq 移除、Node 20.12+ 要求）
- [ ] AC-9.3: 文档含降级步骤（pin 到 `@curdx/flow@6.0.6`）
- [ ] AC-9.4: CHANGELOG.md 顶部 v7.0.0 entry 引用 MIGRATION-V7.md

### US-10: 共享 lib 工具集复用

**As a** 维护者
**I want to** `hooks/scripts/lib/` 提供 jq-equivalent 共享工具（merge-state、count-tasks、cleanup-files 等）
**So that** 多处 markdown 命令复用同一实现，不分散

**Acceptance Criteria:**
- [ ] AC-10.1: `hooks/scripts/lib/` 目录存在并含至少 `merge-state.mjs`、`count-tasks.mjs`、`cleanup-files.mjs` 三个工具（具体清单 design 阶段定）
- [ ] AC-10.2: 每个 lib 工具有独立 smoke test
- [ ] AC-10.3: lib 工具单文件 bundled、零运行时依赖

### US-11: 三平台 CI 全绿才能 release

**As a** 发布者
**I want to** tag push 触发 release.yml 之前先确认 ci.yml 三矩阵全绿
**So that** 不在 Windows 用户那爆雷

**Acceptance Criteria:**
- [ ] AC-11.1: release.yml 加 dependency on ci.yml success（或本地复用同矩阵）
- [ ] AC-11.2: 任一平台失败时 npm publish 不执行

---

## Functional Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-1 | 改造 `plugins/curdx-flow/hooks/hooks.json`：command 改 `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<name>.mjs"`；显式 `"shell": "bash"`；SessionStart 加 `"async": true` | High | AC-1.1, AC-2.1, AC-3.1 |
| FR-2 | 1:1 移植 `load-spec-context.sh` → `src/hooks/load-spec-context.ts`；语义等价（spec 目录解析、frontmatter 读取、context block 输出） | High | AC-1.4, AC-4.1 |
| FR-3 | 1:1 移植 `path-resolver.sh` → `src/hooks/_shared/path-resolver.ts`（ES module export，被多 hook import） | High | AC-4.1 |
| FR-4 | 1:1 移植 `quick-mode-guard.sh` → `src/hooks/quick-mode-guard.ts`；保留 deny/allow JSON schema | High | AC-2.1, AC-2.2 |
| FR-5 | 1:1 移植 `stop-watcher.sh` → `src/hooks/stop-watcher.ts`；含 transcript 解析、ALL_TASKS_COMPLETE 检测、原子 epic state 写入、跨平台 mtime | High | AC-3.1, AC-3.2, AC-3.3, AC-3.4 |
| FR-6 | 1:1 移植 `update-spec-index.sh` → `src/hooks/update-spec-index.ts`；保留 index 输出格式 | High | AC-4.1 |
| FR-7 | 新增 `scripts/build-hooks.mjs`（esbuild driver）：扫描 `src/hooks/*.ts` → bundle 单文件 `.mjs` 输出到 `plugins/curdx-flow/hooks/scripts/` | High | AC-6.1, AC-7.3 |
| FR-8 | 新增 `src/hooks/_shared/stdin.ts`（async iterator 读 stdin JSON）；所有 hook 统一使用 | High | AC-1.4, AC-2.2, AC-3.1 |
| FR-9 | Markdown sweep 全量：14 处 node-oneliner、45 处 extract-to-lib、20 处 inline-prose；验收 `grep -rn '\bjq\b' plugins/curdx-flow` = 0 | High | AC-8.1, AC-8.2, AC-8.3, AC-8.4 |
| FR-10 | 新增 `plugins/curdx-flow/hooks/scripts/lib/`（来自 markdown 抽取的共享工具集）；具体工具清单 design 阶段定 | High | AC-10.1, AC-10.2, AC-10.3 |
| FR-11 | 新增仓根 `.gitattributes`（`*.sh *.mjs *.cjs *.js text eol=lf`）+ `plugins/curdx-flow/hooks/scripts/package.json` (`{"type":"module"}`) | High | AC-1.1, AC-2.1, AC-3.1 |
| FR-12 | `.github/workflows/ci.yml` 改造：`os: [ubuntu-latest, macos-latest, windows-latest]` × `node: [20, 22]` 矩阵；每 leg 跑 typecheck + build + build:hooks + check:hooks-fresh + test:hooks | High | AC-5.1, AC-5.2, AC-5.3 |
| FR-13 | 新增 smoke test 套件（vitest）：每个 hook 至少 1 条 fixture-based 测试；lib 工具每个至少 1 条 | High | AC-5.2, AC-10.2 |
| FR-14 | `package.json` 加 4 个 npm script：`build:hooks`、`check:hooks-fresh`、`test:hooks`、`verify`（聚合）；`prepublishOnly` 链增加 `build:hooks` | High | AC-6.1, AC-7.3 |
| FR-15 | 5-field version gate（`scripts/check-versions.mjs`）适配 v7.0.0；通过 `npm run bump-version major` 同步 5 字段；不引入新版本字段 | High | release SOP |
| FR-16 | 新增 `docs/MIGRATION-V7.md`：BREAKING CHANGE 列表 + 升级步骤 + 降级路径 | High | AC-9.1, AC-9.2, AC-9.3 |
| FR-17 | `CHANGELOG.md` 顶部加 `## 7.0.0 — YYYY-MM-DD` entry，含 `### Breaking` 段并引用 MIGRATION-V7.md | High | AC-9.4 |
| FR-18 | 删除旧 `plugins/curdx-flow/hooks/scripts/*.sh`（5 个生产 + 2 个 test）；git 历史在 v6.0.6 tag 保底 | Medium | clean repo state |
| FR-19 | release.yml 触发条件：tag push 前需 ci.yml 三矩阵 all-green（实现细节 design 阶段定） | Medium | AC-11.1, AC-11.2 |

---

## Non-Functional Requirements

| ID | Requirement | Metric | Target |
|----|-------------|--------|--------|
| NFR-1 | SessionStart hook 性能 | P95 wall time（Windows runner，干净 cwd） | < 200ms |
| NFR-2 | PreToolUse:AskUserQuestion hook 性能 | P95 wall time（Windows runner） | < 100ms |
| NFR-3 | Stop hook 性能 | P95 wall time（Windows runner，含 transcript 解析） | < 500ms |
| NFR-4 | 跨平台可移植性 | 通过 OS 矩阵 | Windows + macOS + Linux 三全绿（含 Windows Git Bash） |
| NFR-5 | 零运行时外部依赖 | 用户机器只需 | Node ≥ 20.12.0；不需 jq、不需 bash 之外的工具 |
| NFR-6 | jq 卸毒验收 | `grep -rn '\bjq\b' plugins/curdx-flow` | 0 行 |
| NFR-7 | 1:1 行为等价 | Linux+macOS 喂同 fixture v6 vs v7 stdout | byte-equal（path separator + mtime 字段允许差异） |
| NFR-8 | Bundled `.mjs` 自包含 | 单文件大小 + 无外部 require | 单文件、零运行时 deps |
| NFR-9 | CRLF 防毒 | `.gitattributes` 钉 LF | `*.sh *.mjs *.cjs *.js text eol=lf` |
| NFR-10 | 维护可读性 | TS 源行数 vs bash 源行数 | 不超过 1.5× 原 bash LOC（含注释） |

---

## Glossary

- **Hook**：Claude Code plugin 在特定生命周期点（SessionStart / PreToolUse / Stop）执行的子进程
- **subprocess deadlock**：Windows 上同步 hook 在 init 期 spawn 子进程，event loop 未启动 → 完成信号收不到（GH #34457）
- **Git Bash**：Windows 上的 MSYS2/MINGW64 bash，Claude Code 在 Windows 默认用它跑 hook command
- **CRLF poison**：Windows checkout 时 `core.autocrlf=true` 把 `\n` 变 `\r\n`，shebang 解析报 `bad interpreter: bash\r`
- **CLAUDE_PLUGIN_ROOT**：Claude Code 注入的环境变量，指向 plugin 根目录；hooks.json command 内可引用
- **Bundled `.mjs`**：esbuild 把 `src/hooks/<x>.ts` + 内部依赖打成单文件 ES module，commit 进仓库
- **Smoke test**：喂固定 stdin JSON fixture → 断言 exit code + stdout 的端到端 hook 测试
- **5-field version gate**：`scripts/check-versions.mjs` 校验的 5 个版本字段（package.json / package-lock × 2 / plugin.json / marketplace.json）必须一致
- **node-oneliner**：markdown 中以 `node -e '<inline JS>'` 形式嵌入的可执行命令（替代 `jq` 单行）
- **extract-to-lib**：复杂 jq/bash 逻辑抽到 `hooks/scripts/lib/<x>.mjs` 共享，markdown 改 `node lib/<x>.mjs` 调用
- **inline-prose**：仅用于说明的 jq 片段改写为自然语言描述（无可执行 token）

---

## Out of Scope

- shellcheck / ESLint 全套 lint 工作（下一个 spec）
- Hook binary signing / cosign attestation（下一个 spec）
- 推荐 PowerShell native hook（`"shell": "powershell"`）—— 用户可自行用，但插件不主推
- macOS Apple Silicon vs Intel 单独 CI 矩阵（全 Node 无 native binary，不必）
- doctor CLI 自检命令（v7 不交付）
- 重构 `src/` 下的 npm CLI 部分（仅 `plugins/curdx-flow/` 为本 spec 范围）
- 移植 2 个 `test-*.sh` 测试脚本（替代品是新的 vitest smoke test 套件）
- 重新设计 spec.schema.json 或 plugin.json schema 校验（SHOULD 但延后）

---

## Dependencies

- 上游：`research.md`（已完成 6-agent merged research）
- 上游：`.progress.md` 中确认的 5 项决策（target、strategy、boundary、release、build approach）
- 工具链：esbuild ≥ 0.24（dev dep 新增）、vitest（dev dep 新增）
- 运行时：Node ≥ 20.12.0（与现有 `engines.node` 一致）
- 平台：GitHub Actions 提供 windows-latest / macos-latest / ubuntu-latest runner
- Anthropic：Claude Code hook 文档当前规范（`shell` / `async` 字段语义）

---

## Success Criteria

- 3 平台 CI 矩阵 all-green（windows-latest 含 Git Bash 模式）
- `grep -rn '\bjq\b' plugins/curdx-flow` 输出 0 行
- 5 个 hook 在 Linux+macOS 与 v6 行为 byte-equal（path/mtime 字段允许差异）
- v7.0.0 npm 发布通过 prepublishOnly + release.yml 全链路
- MIGRATION-V7.md 至少有 1 个真实用户验证升级路径可行（design 阶段定测试人）

---

## Open Questions (Deferred to Design)

下列问题不阻塞 requirements，留给 design.md 决策：

1. Bundle 输出 `.mjs` vs `.cjs`（取决于 Issue #267 是否被 colocated `package.json {"type":"module"}` 完全规避）
2. hooks.json 是否硬编 `"C:/Program Files/Git/bin/bash.exe"` 兜底
3. stop-watcher 任务提取：正则 vs markdown AST（remark-parse）
4. Smoke test runner：vitest 单一 toolchain vs bats 真实 spawn 环境
5. release.yml 三矩阵依赖实现：`workflow_run` 触发 vs 在 release.yml 内复用同矩阵
6. `hooks/scripts/lib/` 具体工具集清单（来自 45 处 extract-to-lib 的归并）
7. esbuild 配置参数（`platform`/`format`/`target`/`banner`）

---

## Next Steps

1. Run `/curdx-flow:design`
2. Coordinator 设 `awaitingApproval = true` 等用户审核 requirements

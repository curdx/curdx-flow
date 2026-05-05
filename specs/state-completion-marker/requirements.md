# Requirements: state-completion-marker

## Goal

把 `.curdx-state.json` 在 `ALL_TASKS_COMPLETE` 时的"删除"语义换成"打 `completed: true` 标记 + 保留文件"，让 spec 完成后工作树保持干净、`update-spec-index` 不再依赖 markdown fallback、`discoveredSkills` / `granularity` / `commitSpec` / `quickMode` 等 interview 决策对 audit 仍可见。版本目标 v7.1.0（minor，保 backwards-compat）。

## User Stories

### US-1: Coordinator 在 ALL_TASKS_COMPLETE 写 `completed: true` 而非删除 state

**As a** spec workflow user
**I want to** completion 后 `.curdx-state.json` 保留在 spec 目录里、内容标记为已完成
**So that** 完成后我的 git 工作树不会出现"deleted" 未 stage 状态（test008 类现场不再发生），同时 audit 信息不丢

**Acceptance Criteria:**
- [ ] AC-1.1: **Given** spec 跑到 `taskIndex >= totalTasks` **When** coordinator 触发 ALL_TASKS_COMPLETE 路径 **Then** 不执行 `rm -f .curdx-state.json`，改为通过 `merge-state.mjs` 写入 `{"completed": true, "completedAt": "<ISO-8601-UTC>", "awaitingApproval": false}`
- [ ] AC-1.2: **Given** completion 路径写完毕 **When** 读取 `.curdx-state.json` **Then** 文件存在、`completed === true`、`completedAt` 是 ISO-8601 UTC 字符串（match `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/`）、`awaitingApproval === false`
- [ ] AC-1.3: **Given** completion 路径写完毕 **When** 检视 state 文件 **Then** ephemeral 字段 `taskIndex`、`taskIteration`、`globalIteration`、`maxTaskIterations`、`maxGlobalIterations` 全部保留原值（不归零、不删除），identity 字段 `source`、`name`、`basePath`、`phase` 保留
- [ ] AC-1.4: **Given** `coordinator-pattern.md` 三处 deletion site（L79-82 Check Completion / L540-543 Native Sync Completion / L760-764 PR Lifecycle Step 5）**When** 阅读 prompt 文档 **Then** 三处都从 `rm -f` / `Delete .curdx-state.json` 改为 "merge-state 写 completed=true"，文案去重无矛盾
- [ ] AC-1.5: **Given** `commands/implement.md` Step 5 Completion (L152-166) **When** 阅读 prompt 文档 **Then** 不再指示删 state，改为指示 merge-state 写 completion marker

### US-2: stop-watcher 用 `completed === true` 严格判等不再 fall through

**As a** spec workflow user
**I want to** spec 完成后 `Stop` 钩子不再触发 continuation block（不会出现 loop-restart）
**So that** observation #514 实证的 "completed spec 文件保留 → stop-watcher fall-through" 风险被关闭

**Acceptance Criteria:**
- [ ] AC-2.1: **Given** state 文件存在且 `completed === true` **When** `stop-watcher.ts` 被 `Stop` hook 触发 **Then** 在 transcript ALL_TASKS_COMPLETE 检测之后、phase 检查之前 silent return，不输出 continuation prompt
- [ ] AC-2.2: **Given** state 文件存在且 `completed` 字段缺失（undefined）**When** stop-watcher 跑 **Then** 仍按 in-progress 处理（fall through 到现有逻辑），保 backwards-compat
- [ ] AC-2.3: **Given** state 文件存在且 `completed === false` **When** stop-watcher 跑 **Then** 按 in-progress 处理
- [ ] AC-2.4: **Given** `CurdxState` interface（`stop-watcher.ts` ~L70）**When** 读 type **Then** 含 `completed?: boolean; completedAt?: string;` 两个 optional 字段
- [ ] AC-2.5: **Given** stop-watcher 单元测试 **When** 跑 `npm test` **Then** 新增至少 1 个 case 验证 `completed=true → silent return`，新增至少 1 个 case 验证 `completed=undefined → fall through`

### US-3: update-spec-index 用 `completed` 字段而不依赖 markdown fallback

**As a** spec index maintainer
**I want to** completed spec 在 index 里显示 `phase=completed`，且数据来自 state 文件结构化字段而非 markdown reverse-parse
**So that** v7.0.2 修复的 fallback bug 根因（observation #406）被消除——markdown 反推降级为 second-tier fallback 而非主路径

**Acceptance Criteria:**
- [ ] AC-3.1: **Given** state 文件存在且 `completed === true` **When** `readState()`（`update-spec-index.ts:145-153`）被调用 **Then** 返回的 phase 派生值为 `"completed"`，不调用 `inferPhaseFromFiles`
- [ ] AC-3.2: **Given** state 文件存在且 `completed === true` **When** `buildSpecRecord()` (`update-spec-index.ts:278-294`) 渲染 **Then** record.phase = `"completed"`、record.taskIndex/totalTasks 仍来自 state 字段（保审计渲染）
- [ ] AC-3.3: **Given** state 文件存在且 `completed === true` **When** `computeStatusCell` / `computePhaseCell` (`update-spec-index.ts:390-415`) 计算单元格 **Then** status/phase cell 显示 `done` / `completed`
- [ ] AC-3.4: **Given** state 文件不存在（已删除 spec 或老版本残留场景）**When** update-spec-index 跑 **Then** `inferPhaseFromFiles` (`update-spec-index.ts:200-249`) 仍作为 second-tier fallback 被调用，保留 v7.0.2 已修复的 anchored regex 行为
- [ ] AC-3.5: **Given** update-spec-index 单元测试 **When** 跑 `npm test` **Then** 新增至少 1 个 case 验证 `completed=true → phase="completed"，未调用 inferPhaseFromFiles`，旧 case（state 缺失走 fallback）仍 pass

### US-4: load-spec-context 在 completed 状态显示已完成提示而非 phase prompt

**As a** spec workflow user
**I want to** completed spec 被 `SessionStart` hook 加载时显示 "Spec completed (<completedAt>)" 而不是当前 phase 的 resume prompt
**So that** 用户不会在已完成 spec 上误触发新一轮执行

**Acceptance Criteria:**
- [ ] AC-4.1: **Given** state 文件存在且 `completed === true` **When** `load-spec-context.ts` (L139-145, L191-210) 跑 **Then** stderr 输出 `Spec completed: <name> (<completedAt>)` 形式提示，不输出 phase / taskIndex / totalTasks 续作 prompt
- [ ] AC-4.2: **Given** state 文件 `completed === undefined` 或 `completed === false` **When** load-spec-context 跑 **Then** 按当前 phase 输出 resume context（保 backwards-compat）
- [ ] AC-4.3: **Given** `CurdxState` interface (`load-spec-context.ts:27-32`) **When** 读 type **Then** 含 `completed?: boolean` 字段
- [ ] AC-4.4: **Given** load-spec-context 单元测试 **When** 跑 `npm test` **Then** 新增至少 1 个 case 验证 `completed=true → 显示已完成提示`

### US-5: quick-mode-guard 在 completed 状态行为不变

**As a** plugin maintainer
**I want to** quick-mode-guard 在 completed spec 上不产生 false-positive deny
**So that** 完成态下若用户偶发触发 AskUserQuestion 流程也不会被错误 block（completed spec 的 `quickMode` 字段已固化）

**Acceptance Criteria:**
- [ ] AC-5.1: **Given** state 文件 `completed === true` 且 `quickMode === true` **When** `quick-mode-guard.ts` (L50-65) 跑 **Then** 行为与当前一致（保留现有 deny 逻辑），不引入新分支
- [ ] AC-5.2: **Given** quick-mode-guard 现有测试套件 **When** 跑 `npm test` **Then** 全部继续 pass，无回归
- [ ] AC-5.3: **Given** `CurdxState` interface in `quick-mode-guard.ts` **When** 读 type **Then** 加 `completed?: boolean` optional 字段（schema 一致性，零行为变更）

### US-6: refactor 命令在 completed 后 reset `completed` + 删 `completedAt`

**As a** spec workflow user
**I want to** 完成后跑 `/curdx-flow:refactor` 修改 tasks 时 state 文件被 reset 为 in-progress
**So that** 下一轮 implement 不会被 `completed === true` guard 拦截，能正常 resume

**Acceptance Criteria:**
- [ ] AC-6.1: **Given** state 文件存在且 `completed === true` **When** `/curdx-flow:refactor` 命令跑完 **Then** state 文件 `completed === false`，且 JSON object 不再含 `completedAt` key（不存为 null，避免 schema 噪声）
- [ ] AC-6.2: **Given** refactor 后的 state 文件 **When** 检视 ephemeral 字段 **Then** `taskIndex`、`taskIteration`、`globalIteration` 不被 reset（用户可手工编辑 tasks.md 后选择是否 `merge-state` 归零）
- [ ] AC-6.3: **Given** `commands/refactor.md` prompt **When** 阅读 **Then** 含明确指令调用 `merge-state.mjs` 写 `{"completed": false}` 并通过 jq / merge-state 删 `completedAt` key
- [ ] AC-6.4: **Given** 不维护 `completedHistory[]` **When** 检视 schema 与文档 **Then** 无 `completedHistory` / `completionLog` 之类数组字段；reset 不留痕（历史在 git log 里查得到）

### US-7: cancel 命令保留删整个 spec dir 行为，不影响 completion marker 路径

**As a** spec workflow user
**I want to** `/curdx-flow:cancel` 仍按现状删整个 spec 目录（state 一并消失），不与 completion marker 路径混淆
**So that** cancel（用户主动放弃）和 complete（任务跑完）语义清晰可分

**Acceptance Criteria:**
- [ ] AC-7.1: **Given** in-progress 或 completed spec **When** 跑 `/curdx-flow:cancel` **Then** 整个 spec 目录被 `rm`，state 文件随之消失（行为与 v7.0.2 一致）
- [ ] AC-7.2: **Given** `commands/cancel.md` (L46-71) **When** 阅读 prompt **Then** 不引入 "merge cancelledAt"、"completed=false + cancelled marker" 之类新逻辑（design-decision-deferred；本 spec 不做）
- [ ] AC-7.3: **Given** cancel 后再跑 `update-spec-index` **When** 检视 index **Then** 该 spec 从 index 中移除（spec 目录已不存在）

### US-8: 半途升级 / 已完成已删 spec 的 backwards-compat

**As a** v7.0.2 用户升级到 v7.1.0
**I want to** 升级过程中 in-progress spec 不被误判为 completed，已删 state 的旧 spec 不被 retroactive 重建
**So that** 升级不破坏正在执行的 spec、不污染 git 历史

**Acceptance Criteria:**
- [ ] AC-8.1: **Given** v7.0.2 留下的 state 文件（无 `completed` 字段）**When** v7.1.0 任意 hook 读取 **Then** 按 `completed === undefined → in-progress` 处理（严格 `=== true` 判等，绝不用 truthy `if (state.completed)`）
- [ ] AC-8.2: **Given** 已完成且 state 已删的 spec（如 test008/helloworld、curdx-flow/specs/cross-platform-support）**When** v7.1.0 升级后跑 update-spec-index **Then** 不为这些 spec 重生 stub state；走 second-tier fallback `inferPhaseFromFiles` 推断 phase
- [ ] AC-8.3: **Given** `docs/MIGRATION-V7.md` **When** 阅读 **Then** 含 v7.1.0 升级章节，明确说明：(a) `completed` 字段是 optional + 严格判等；(b) 老 state 文件不需要 backfill；(c) 已删 spec 可选手工 `git checkout HEAD -- specs/<name>/.curdx-state.json && jq '. + {completed:true,completedAt:"..."}' …`（snippet 给出）
- [ ] AC-8.4: **Given** `CHANGELOG.md` **When** 阅读 **Then** 含 v7.1.0 章节，记录契约变更理由（audit + 工作树洁净 + index 不依赖 fallback），引用 commit / observation IDs

### US-9: 审计友好的 schema（jq one-liner 可用）

**As a** spec workflow power user
**I want to** 完成后用 `jq` 查 `taskIteration` / `globalIteration` / `discoveredSkills` 等 audit 字段
**So that** 我能知道哪个 task 最难收敛、当时 interview 决策是什么

**Acceptance Criteria:**
- [ ] AC-9.1: **Given** completed spec 的 state 文件 **When** 跑 `jq '.completed' .curdx-state.json` **Then** 输出 `true`
- [ ] AC-9.2: **Given** completed spec **When** 跑 `jq '.taskIteration' .curdx-state.json` **Then** 输出 task-level iteration 计数（数字或 object，原值保留）
- [ ] AC-9.3: **Given** completed spec **When** 跑 `jq '.discoveredSkills, .granularity, .commitSpec, .quickMode' .curdx-state.json` **Then** interview 决策字段全部可读
- [ ] AC-9.4: **Given** `plugins/curdx-flow/schemas/spec.schema.json` **When** validate completed state 文件 **Then** schema validation pass（新增 `completed: {type:"boolean"}` + `completedAt: {type:"string", format:"date-time"}` 两个 optional properties）
- [ ] AC-9.5: **Given** `plugins/curdx-flow/skills/curdx-core/references/state-file-schema.md` **When** 阅读 **Then** 含 `completed` / `completedAt` 字段说明 + Phase 转换图末尾 `execution → completed (completed: true)`

### US-10: ensure-gitignore lib wire-in（observation #513，独立 US）

**As a** spec workflow user
**I want to** 新建 spec 时 `.curdx-state.json` 自动加入 `.gitignore`
**So that** state 文件不再被 `commitSpec=true` 误带进 git 历史（test008 现场的另半边修复）

**Acceptance Criteria:**
- [ ] AC-10.1: **Given** `src/hooks/lib/ensure-gitignore.ts` 已存在且测试齐全 **When** 阅读 `plugins/curdx-flow/commands/start.md` **Then** 在 `Initialize .curdx-state.json` 段落（L131-141）之前或同步位置新增 1 行调用，确保 `.curdx-state.json` 被 ensure 进当前仓库 `.gitignore`
- [ ] AC-10.2: **Given** 全新仓库无 `.gitignore` 文件 **When** 跑 `/curdx-flow:start` 创建第一个 spec **Then** 仓库根生成 `.gitignore` 且包含 `.curdx-state.json` 行
- [ ] AC-10.3: **Given** 已有 `.gitignore` 不含 state 模式 **When** 跑 `/curdx-flow:start` **Then** ensure-gitignore lib 追加 `.curdx-state.json` 到现有文件（不重复、不破坏现有内容；与 lib 现有测试断言一致）
- [ ] AC-10.4: **Given** 已有 `.gitignore` 已含 state 模式 **When** 跑 `/curdx-flow:start` **Then** ensure-gitignore lib no-op（idempotent）
- [ ] AC-10.5: **Given** `tests/hooks/lib/ensure-gitignore.test.ts` **When** 跑 `npm test` **Then** 全部 pass（lib 行为不变，仅 wire-in 是 prompt-level，不需新增 lib 测试；本 US 的回归靠 manual VE + start.md prompt diff 确认）

## Functional Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-1 | `spec.schema.json` 增 `completed: boolean`、`completedAt: string (date-time)` 两个 optional properties；不修改 `phase` enum | High | AC-9.4 |
| FR-2 | Coordinator ALL_TASKS_COMPLETE 路径（3 处文档 + 1 处 implement.md）改为 merge-state 写 `completed:true / completedAt:<ISO> / awaitingApproval:false` | High | AC-1.1, AC-1.2, AC-1.4, AC-1.5 |
| FR-3 | Ephemeral 字段 (`taskIndex`, `taskIteration`, `globalIteration`, `maxTaskIterations`, `maxGlobalIterations`) 在 completion 时保留原值 | High | AC-1.3, AC-9.2 |
| FR-4 | `awaitingApproval` 在 completion 时归 false | High | AC-1.2 |
| FR-5 | `stop-watcher.ts` parse state 后用 `state.completed === true` 严格判等 silent return；guard 顺序在 transcript ALL_TASKS_COMPLETE 检测之后、phase 检查之前 | High | AC-2.1, AC-2.2, AC-2.3 |
| FR-6 | `update-spec-index.ts` `readState()` / `buildSpecRecord()` / `compute*Cell` 在 `completed===true` 时输出 phase=`completed`，不调用 `inferPhaseFromFiles` | High | AC-3.1, AC-3.2, AC-3.3 |
| FR-7 | `inferPhaseFromFiles` 保留为 second-tier fallback（state 文件缺失场景）；逻辑与 v7.0.2 anchored regex 一致 | High | AC-3.4, AC-8.2 |
| FR-8 | `load-spec-context.ts` 在 `completed===true` 时输出 `Spec completed: <name> (<completedAt>)` 提示，不输出 resume context | High | AC-4.1, AC-4.2 |
| FR-9 | `quick-mode-guard.ts` 行为不变，仅 type interface 加 `completed?: boolean` 字段 | Medium | AC-5.1, AC-5.3 |
| FR-10 | `commands/refactor.md` 在 reset tasks 时调用 merge-state 写 `completed:false` 且删 `completedAt` key（不存为 null）；不维护 `completedHistory[]` | High | AC-6.1, AC-6.3, AC-6.4 |
| FR-11 | `commands/cancel.md` 保留 `rm` 整个 spec 目录行为，不引入 cancellation marker；本 spec 不动 | High | AC-7.1, AC-7.2 |
| FR-12 | 所有 hook `CurdxState` interface 加 `completed?: boolean; completedAt?: string;`；严格 `=== true` 判等（禁用 truthy `if (state.completed)`） | High | AC-2.4, AC-4.3, AC-5.3, AC-8.1 |
| FR-13 | `commands/start.md` Initialize 段写入 `completed: false` 默认；`init-execution-state.ts` `EMBEDDED_TEMPLATE` (L22-36) 同步加默认值 | High | AC-1.2 |
| FR-14 | `commands/start.md` 顺手调用 `ensure-gitignore` lib 把 `.curdx-state.json` 写入仓库 `.gitignore` | Medium | AC-10.1 to AC-10.5 |
| FR-15 | 文档同步：`coordinator-pattern.md`、`implement.md`、`commit-discipline.md`（L70 注释）、`help.md`（L110 注释）、`state-file-schema.md`、`spec-scanner.md`（Resume Flow） | Medium | AC-1.4, AC-1.5, AC-9.5 |
| FR-16 | `start.md` Resume Flow + `spec-scanner.md` Resume Flow：检测 `completed===true` 时提示 "This spec is completed (<completedAt>). Use /curdx-flow:refactor or create a new spec." 而非续作 phase prompt | Medium | AC-4.1 |

## Non-Functional Requirements

| ID | Requirement | Metric | Target |
|----|-------------|--------|--------|
| NFR-1 | 版本目标 | semver bump level | **v7.1.0 (minor)**；package.json + package-lock.json (×2) + plugin.json + marketplace.json 五处全 sync；`npm run check-versions` pass |
| NFR-2 | Backwards-compat：老 state 文件 | `completed === undefined` 处理路径 | 严格按 in-progress 处理；所有 5 个 hook 用 `=== true` 严格判等而非 truthy；通过单元测试断言（`{completed: undefined}` fixture → 走 in-progress 分支）|
| NFR-3 | Backwards-compat：完成时间格式 | `completedAt` 序列化格式 | ISO-8601 UTC，正则 `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$`；JSON Schema `format: date-time` |
| NFR-4 | Hook 测试通过率 | `npm test` 退出码 | 0；现有所有 byte-equal / fixture / vitest case 100% pass，无 skip |
| NFR-5 | 新增回归测试覆盖 | 新增 vitest case 数 | ≥ 4：(a) stop-watcher `completed=true → silent return`；(b) stop-watcher `completed=undefined → fall through`；(c) update-spec-index `completed=true → phase="completed"`；(d) load-spec-context `completed=true → 显示已完成提示` |
| NFR-6 | Fixture 重生稳定性 | baseline JSON diff | 仅 byte-equal `Completed spec` fixture 的 baseline JSON 重生；其他 baseline 0 diff |
| NFR-7 | Fixture API 稳定 | `tests/hooks/_fixture-setup.ts` 公共 API | `createFixtureSpec()` 签名不变；`DEFAULT_STATE` 加 `completed:false` 默认值，旧测试不需改即继续 pass |
| NFR-8 | CHANGELOG entry | 是否含 v7.1.0 章节 | CHANGELOG.md 顶部新增 `## 7.1.0 — YYYY-MM-DD` 节，列 `### Added`（completed marker）/ `### Changed`（state retention 语义）/ `### Migration`（升级指引）三个子段 |
| NFR-9 | MIGRATION 文档 | docs/MIGRATION-V7.md 章节 | 新增 v7.1.0 升级 section，含手工恢复已删 state 的 jq snippet（AC-8.3）|
| NFR-10 | Build pipeline 健康 | `npm run typecheck && npm run build && npm run check:hooks-fresh` | 全部退出码 0；`hooks/scripts/*.mjs` 与 `src/hooks/**/*.ts` 不 desync |
| NFR-11 | Index fallback 性能 | `inferPhaseFromFiles` 调用率 | 升级后已完成 spec 走 fallback 比例 < 5%（仅 v7.1.0 之前已删 state 的历史 spec）；新建 spec 0% 走 fallback |

## Glossary

- **state file** — `<basePath>/.curdx-state.json`，per-spec 结构化执行状态文件
- **completed marker** — state 文件中的 `completed: boolean` 字段；`true` 表示 spec 已跑完所有 tasks
- **ephemeral fields** — `taskIndex`、`taskIteration`、`globalIteration`、`maxTaskIterations`、`maxGlobalIterations`、`awaitingApproval`，运行时频繁更新的字段；completion 时保留原值用于 audit（`awaitingApproval` 例外，归 false）
- **identity fields** — `source`、`name`、`basePath`、`phase`，schema 必填字段，identifies the spec
- **merge-state** — `plugins/curdx-flow/hooks/scripts/lib/merge-state.mjs`，把 partial JSON 合并进现有 state 文件的工具
- **inferPhaseFromFiles fallback** — `update-spec-index.ts:200-249` 的 markdown reverse-parse 逻辑（v7.0.2 已用 anchored regex 修复 AC checklist 误算）；保留作为 state 文件缺失时的 second-tier fallback
- **awaitingApproval** — boolean 字段，phase agent 完成后置 `true` 表示等用户手动跑下一个 phase 命令；completion 时归 `false`
- **second-tier fallback** — state 文件不存在时（如已删 spec、第三方 fork、人工删除）才会被触达的 phase 推断路径

## Out of Scope

- `.progress.md` 重构 / 归档策略（goal 明示）
- 引入新归档目录（如 `specs/.archive/`）
- Epic-level completion marker（epic 完成态由 `.current-epic` + spec entry 维护，本 spec 不扩展）
- `completedHistory[]` 数组（design-decision-deferred；用户决定 MVP 不做，refactor 不留痕，历史在 git log 里查）
- Retroactive stub：不为已完成已删 state 的旧 spec（test008/helloworld、curdx-flow/specs/cross-platform-support）重生 state 文件
- `cancel.md` 引入 `cancelledAt` / cancellation marker（design-decision-deferred；cancel 仍 rm 整个 spec dir）
- 本轮 context7 / WebSearch 外部研究（research 阶段已 deferred，复用 memory obs #411-414）
- 新增 PostToolUse / PreToolUse hook（保留 prompt-driven 模型，不增加 hook 注册项）
- `quick-mode-guard.ts` 行为变更（仅加 type 字段，零行为差异）

## Dependencies

- Node.js ≥ 20（CI / 用户本地最低版本，与现有 package.json `engines` 字段一致）
- esbuild（`hooks/scripts/*.mjs` bundling pipeline，CLAUDE.md 明示）
- vitest（`tests/hooks/*.test.ts` runner；design 阶段 1 行 `cat package.json | jq .scripts` 确认）
- `plugins/curdx-flow/hooks/scripts/lib/merge-state.mjs`（已存在，coordinator/agent 均通过它写 state）
- `src/hooks/lib/ensure-gitignore.ts`（已存在 + 测试齐全；US-10 wire-in 不新增 lib 代码）
- `tests/hooks/baselines/v6.0.6/`（byte-equal baseline 锁定）
- `tests/hooks/fixtures/update-spec-index/`（v7 baseline JSON，本 spec 重生其中 `Completed spec` fixture）
- `npm run check-versions`（5-field version sync gate，CLAUDE.md 明示）

## Unresolved Questions

_Empty._ 所有 design-level 开放点已 deferred 到 Out of Scope（cancel cancellationMarker、completedHistory[]、archive dir、epic-level marker）；migration 路径（手工 jq snippet）已固化在 AC-8.3。

## Success Criteria

1. **test008 复跑工作树最终干净**：在 test008 本地复跑（或新建 fixture spec 模拟 commit state 进 git 历史的旧仓库），跑完一个 spec 完整 lifecycle 后 `git status` 不出现 `.curdx-state.json: deleted` 状态。
2. **`update-spec-index` 不依赖 fallback regex**：v7.1.0 升级后跑 update-spec-index，对所有新建 spec `inferPhaseFromFiles` 调用计数为 0；index 中已完成 spec 全部显示 `phase=completed`。
3. **stop-watcher 不 loop-restart**：在 completed spec 上手工触发 `Stop` hook，不输出 continuation prompt（直接 silent return）。验证方式：手工 invoke + 单元测试（NFR-5 case (a)）。
4. **审计 jq 友好**：`jq '.completed, .completedAt, .taskIteration, .discoveredSkills' .curdx-state.json` 在 completed spec 上全部返回有意义值（非 null 非 missing）。
5. **CI 全绿**：`npm run typecheck && npm run build && npm test && npm run check-versions && npm run check:hooks-fresh` 全部退出码 0；GitHub Actions release.yml 在 v7.1.0 tag push 后成功 publish。
6. **Backwards-compat 实证**：构造 v7.0.2 风格 fixture state（无 `completed` 字段），喂给 v7.1.0 hooks 全部按 in-progress 处理（NFR-2 case 通过）。

## Next Steps

1. `/curdx-flow:design` —— 把 FR-2 / FR-5 / FR-6 / FR-8 / FR-10 转成具体代码 diff（hook .ts 文件 + prompt .md 文件 + schema JSON）；明确 `merge-state` 调用的精确 JSON shape（含字段顺序、`completedAt` 生成 snippet）
2. design 阶段须 1-行确认 vitest 是 runner（`cat package.json | jq .scripts.test`）
3. design 阶段须向用户**显式确认 v7.1.0 minor bump**（与 CLAUDE.md 默认 patch 偏好冲突，需 explicit override）
4. design 阶段细化 `commands/refactor.md` 删 `completedAt` key 的实现（merge-state 是否原生支持 unset，还是需要先 read → JSON.parse → delete → write）

---

## 反向自审

**Q1：隔壁组 PM review 时最容易挑刺的一条 NFR 是什么？我自己怎么回答？**

最容易挑刺的是 **NFR-11（Index fallback 性能 < 5%）**。质疑：你怎么测量 fallback 调用率？没有 telemetry。
回答：(a) 这是 leading indicator 而非合规阈值，design 阶段可加 stderr 一行 `[update-spec-index] fallback: <count>/<total>` 让用户自审，无需上报；(b) 真实验证靠 NFR-5 的单元测试断言"completed=true 不调用 inferPhaseFromFiles"（spy/mock 即可），定性而非定量；(c) 如果 PM 坚持指标可量化，把 NFR-11 降级为 design 阶段 observation 而非 NFR。

**Q2：AC 集合是否覆盖了 research.md Codebase Inventory Priority 1 表里**所有**写/读 state 站点？逐一映射。**

写入 / 删除（Priority 1 表 A）：
- `coordinator-pattern.md:79-82` → AC-1.4
- `coordinator-pattern.md:540-543` → AC-1.4
- `coordinator-pattern.md:760-764` → AC-1.4
- `commands/implement.md:152-166` → AC-1.5
- `commands/cancel.md:46-71` → AC-7.1, AC-7.2（保留删除）
- `references/commit-discipline.md:70` → FR-15
- `commands/start.md:131-141` → FR-13, AC-10.1
- `src/hooks/lib/init-execution-state.ts:22-36` → FR-13
- `templates/.curdx-state.template.json` → 不存在，FR-13 决定维持现状（inline）

读取（Priority 1 表 B）：
- `stop-watcher.ts:559-560` → AC-2.1（最高风险点）
- `stop-watcher.ts CurdxState interface` → AC-2.4
- `stop-watcher.ts:601-606` → AC-2.1（guard 顺序）
- `load-spec-context.ts:139-145, 191-210` → AC-4.1, AC-4.2
- `load-spec-context.ts:27-32 CurdxState` → AC-4.3
- `quick-mode-guard.ts:50-65` → AC-5.1, AC-5.3
- `update-spec-index.ts:145-153 readState()` → AC-3.1
- `update-spec-index.ts:278-294 buildSpecRecord()` → AC-3.2
- `update-spec-index.ts:390-415 compute*Cell` → AC-3.3
- `update-spec-index.ts:200-249 inferPhaseFromFiles` → AC-3.4, FR-7
- `commands/start.md:88-118 Resume Flow` → FR-16
- `references/spec-scanner.md:206-220 Resume Flow` → FR-16
- `commands/status.md:54` → FR-15（文档同步）
- `commands/refactor.md:27, 112-117` → AC-6.1, AC-6.3
- `commands/feedback.md:49` → 不动（research 标 none）
- `references/branch-management.md` → 不动（research 标 none）
- `references/quick-mode.md` → 不动（research 标 none）
- `references/failure-recovery.md` → 不动（research 标 none）
- `agents/spec-executor.md` + 其他 agents → 不动（research 标 none）

**结论**：Priority 1 表 A + B 全覆盖；标 "none / 不动" 的站点在 Out of Scope 或 NFR-4（"现有测试 100% pass"）兜底确认无回归。

**Q3：v7.1.0 版本目标的 backwards-compat 承诺是否足够具体到能写测试？**

是。具体测试 hook：
- NFR-2 → 单元测试可断言：构造 `{phase:"execution", taskIndex:5, totalTasks:10}`（无 `completed` 字段）的 fixture state，喂给 stop-watcher / load-spec-context / update-spec-index，期望分别 fall-through、显示 phase prompt、显示 phase=execution（不显示 completed）。三个 hook 各 1 个 case。
- NFR-3 → schema validation test（如果用 ajv，可 1 行）：`completedAt: "not-iso"` 验证失败、`completedAt: "2026-05-04T13:36:00Z"` 验证通过。
- AC-8.1 → grep `=== true` 出现次数 ≥ 5（5 个 hook 的 CurdxState 读点），grep `if (state.completed)`（无 `=== true`）出现 0 次——可加到 lint / ci-check 脚本。
- AC-8.2 → manual VE 任务（已删 state spec 升级后 update-spec-index 输出含 `phase=completed`，靠 fallback regex），可加 1 个 fixture（state 不存在 + .progress.md 含 completed 痕迹）做 vitest 断言。

承诺足够具体到 design 可直接落代码，无需进一步澄清。

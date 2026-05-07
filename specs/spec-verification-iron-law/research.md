---
spec: spec-verification-iron-law
epic: superpowers-uplift
phase: research
created: 2026-05-06
researchers: [E1 reality-verification-skill, E2 hook-framework, E3 test-and-verify, R1 anthropic-docs]
---

# Research: spec-verification-iron-law

## Executive Summary

**关键发现（强制策略调整）**：`TaskCompleted` 事件**不是 GA** —— 它是 Anthropic Agent Teams（research preview）的一部分，必须 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 才能 fire。这意味着 epic.md 把 TaskCompleted 当作主验证闸门是**误判**。**修正策略**：把 `Stop` hook（GA、所有用户都有）作为**铁律主闸**，把 `TaskCompleted`（opt-in、Agent Teams 用户才有）作为**第二层加固**。`stop_hook_active` 字段经核对**已被官方文档化**（hooks-guide troubleshooting 段有完整 bash 示例），早期 epic 研究里"undocumented but real"的说法要纠正。`reality-verification` skill 现状清晰（110 LOC + 2 个 reference doc，被 4 个下游文件按名引用），rename + 升级风险 LOW-MEDIUM。`.curdx-state.json` schema 加 `verificationBlocks` 字段是纯加项变更，PATCH bump 即可。

## External Research (R1)

### TaskCompleted 事件 — GA 判定

> **Verdict: NOT GA. Experimental. Off by default.**

来自 Anthropic 官方 Agent Teams 文档：

> *"Agent teams are experimental and disabled by default. Enable them by adding `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to your settings.json or environment."* `[1]`

`TaskCompleted` 在 hooks reference 里有完整定义，但其**触发条件（agent team task list）只在 Agent Teams 启用时存在**。没有 env var → 没有 task list → 事件永不 fire。Boris Cherny（Anthropic Claude Code lead）on X: *"Out now: Teams in Claude Code Team are experimental, and use a lot of tokens."* `[9]`。

**Input schema（确认 GA 时为）**：

```json
{
  "session_id": "...",
  "transcript_path": "...",
  "cwd": "...",
  "permission_mode": "default",
  "hook_event_name": "TaskCompleted",
  "task_id": "...",
  "task_title": "...",
  "task_status": "completed"
}
```

### Stop 事件 — 主闸（GA 确认）

- **GA**：列入官方 lifecycle table，无 experimental flag、无 matcher 限制 `[2][6]`
- **stop_hook_active 已官方文档化**：troubleshooting guide 有完整 bash 示例 + SDK docs 也列出 `[3][4][11]`
- **三个真实 GH issue 实锤**：claude-code#10205 / #3573 / claude-mem#1288 都是因为 hook 没 early-exit `stop_hook_active` 导致无限 loop 烧 token
- **野外参考实现**：`disler/claude-code-hooks-mastery` 的 `stop.py` 是事实标准 —— stdin parse → check stop_hook_active → run validators → `{"decision":"block","reason":"..."}`

### Compaction 抗性共识

强一致：hooks > CLAUDE.md > skills。理由是 hooks 在 LLM context 之外的进程层执行，不受 compaction 影响。spec 的"iron law 落在三处"策略与共识对齐。

### Schema 加项变更最佳实践

JSON Schema 的 optional field 加项是纯非破坏变更：旧版客户端读到额外字段会忽略；新版客户端读到旧 state 时该字段为 undefined（与默认值兼容）。PATCH bump 足够，不需要 MAJOR。

### Open prior art

**没有任何公开仓库实现 TaskCompleted gate**（Agent Teams 才 3 个月，且要 opt-in）。我们做了就是先行者。

## Codebase Analysis

### Hook Framework (E2)

**hooks.json 现有事件**：PreToolUse / Stop / SessionStart（详见 partial）

**hook 脚本目录**：
- raw scripts: `task-completed-verifier`（**待新增**）/ `stop-watcher` / `quick-mode-guard` / `load-spec-context` / `update-spec-index` / `task-stop-validator` 等
- lib helpers: `merge-state.mjs` / `init-execution-state.mjs` / `count-mocks.mjs` / `count-tasks.mjs` 等
- _shared: `types.ts`（定义 `CurdxState`）+ 通用 wrapper

**新事件接入路径（cleanly）**：
1. `src/hooks/task-completed-verifier.ts`（新源文件）
2. 加入 `scripts/build-hooks.mjs` 的 `HOOK_ENTRIES` 数组 → esbuild 自动 bundle 到 `plugins/curdx-flow/hooks/scripts/task-completed-verifier.mjs`
3. `plugins/curdx-flow/hooks/hooks.json` 加 `TaskCompleted` 事件注册 + matcher
4. `npm run check:hooks-fresh` CI gate 自动 enforce 源 ↔ bundle 同步

**stop-watcher.ts 注入点**：
现有逻辑在 `phase === "execution" && taskIndex >= totalTasks && totalTasks > 0` 检查未完成任务（line ~680）。**新逻辑插这里**：

```typescript
const verificationBlocks = state.verificationBlocks ?? [];
for (const block of verificationBlocks) {
  if (!block.status || block.status !== "passed") {
    return buildVerificationFailedBlock(block, specPath);
  }
}
```

镜像现有 `buildXxxBlock()` 模式。

**CurdxState 接口扩展位置**（`src/hooks/_shared/types.ts` L134-157）：在 `epicName` 之后、`completed` 之前插入：

```typescript
verificationBlocks?: Array<{
  id: string;           // e.g., "phase-exit-tasks-1"
  name: string;
  description?: string;
  status?: "pending" | "passed" | "failed" | "skipped";
  failedReason?: string;
  verifiedAt?: string;  // ISO 8601
}>;
```

**spec.schema.json 同源添加**：在 `epicName` 之后追加对应 JSON Schema 节点（与 TS 接口双源同步）。

**merge-state.ts**：现有原子合并机制（temp 文件 + rename + pid + random hex）足够 verificationBlocks 写入；支持 `$unset` 字段。

### Reality-Verification Skill 现状 (E1)

**SKILL.md**（`skills/reality-verification/`，v0.2.0，110 LOC，user-invocable=false）：
- 触发关键词 6 个，由 coordinator 自动派发到 task-planner + qa-engineer
- 目前作用域：单个 VF 任务（Phase 4 fix-type spec）
- Iron Law 已存在：BEFORE/AFTER 失败复现 + mock-only 反模式拦截

**Reference docs（2 个，~220 行）**：
| 文件 | 作用 |
|---|---|
| `goal-detection-patterns.md` | 6 个 regex 把 user goal 分类为 Fix vs Add；驱动 VF 任务是否生成 |
| `mock-quality-checks.md` | 6 类 mock 反模式（Mockery / Missing Real Imports / Behavioral-Only / No Integration / Partial Mocking / No Cleanup）+ BEFORE/AFTER 测试验证格式 |

**VF 任务格式权威定义**：`references/quality-checkpoints.md` §"VF Task for Fix Goals" line 108-122；`agents/task-planner.md` §"VF Task Generation for Fix Goals" line 266-296。

**下游引用此 skill 名字的 4 个文件**（必须随 rename 同步）：
1. `plugins/curdx-flow/agents/task-planner.md` line 290
2. `src/hooks/lib/count-mocks.ts` line 5
3. `src/hooks/lib/README.md` line 42
4. `plugins/curdx-flow/skills/reality-verification/.curdx-state.json` line 15（如存在）

**Backwards-compat 策略**：保留旧路径 stub（重定向到新 skill），降低破坏面。

**Scope 扩展 4 个 gap（必须由新 skill 覆盖）**：
1. **Phase-exit verification** —— 当前只覆盖单 task，不覆盖 phase 边界
2. **Commit/tag/release verification gates** —— 当前不覆盖
3. **Universal "any completion claim"** —— 当前限定 fix-type spec
4. **Evidence staleness detection** —— 当前不比对 srcMtime ↔ verifiedAt

### Test + Verify Pipeline (E3)

**测试组织**：
- `tests/hooks/*.test.ts` —— 单测 + fixture 集成（vitest forks pool, 5000ms timeout）
- `tests/runner/*.test.ts` —— renderBlock / buildFreshness / claudeMd
- `tests/analyze/*.test.ts` —— 报告分析

**Hook 测试模式**：
- `createFixtureSpec()` helper 动态建临时 spec dir + `.curdx-state.json`
- `runHook(scriptPath, { cwd, stdin })` 模拟 hook stdin
- `afterEach(() => cleanup())` 清理
- exit code + 状态文件 byte-equal 双重断言

**新 hook 测试落点**：
- Source: `src/hooks/task-completed-verifier.ts`
- Test: `tests/hooks/task-completed-verifier.test.ts`
- 5 个必备 case：valid block / missing block / stale timestamp / malformed block / error stdin
- Stop hook 扩展加 2-3 个 case 到现有 `tests/hooks/stop-watcher.test.ts`

**跨平台已知坑**（来自 cross-platform-support spec）：
- 不要 hardcode `/tmp` —— 用 `tmpdir() + mkdtempSync()`
- nullish-coalesce `spawnSync` 的 stdout/stderr（Windows undefined）
- `mtimeMs` 单位是 ms，比对秒级时间戳要除 1000
- fixture 行尾要 normalize

## Quality Commands

| 命令 | 用途 | 何时跑 |
|---|---|---|
| `npm run typecheck` | TS strict 类型校验 | pre-commit, CI |
| `npm run build:hooks` | 把 src/hooks/*.ts bundle 到 plugins/curdx-flow/hooks/scripts/*.mjs | 改 hook 源后 |
| `npm run check:hooks-fresh` | 校验 bundle 与源 git diff = 0 | pre-commit, CI |
| `npm run test:hooks` | 跑 vitest hooks 子集 | dev + CI matrix |
| `npm run verify` | 完整 pre-publish 闸（typecheck + check-versions + check:hooks-fresh + build + check:bundle + test:hooks + test:analyze） | release 前 |
| **CI matrix** | 4-leg：ubuntu 20/22 / macos 22 / windows 22 | merge gate |

## Feasibility Assessment

| 维度 | 评估 | 备注 |
|---|---|---|
| **Stop hook 主闸** | HIGH | GA、文档齐全、3 个 GH issue 给定参考实现路径、`stop_hook_active` early-exit 模板成熟 |
| **TaskCompleted opt-in 二层** | MEDIUM | 不是 GA；但 opt-in 用户能用，对那部分人是真护栏；scope 缩小为"启用了 Agent Teams 才生效" |
| **Schema 扩展** | HIGH | 纯加项；与 state-completion-marker 已 ship 字段（completed/completedAt）位置兼容、无冲突 |
| **Skill rename + scope 升级** | MEDIUM | 4 个下游文件需要 rename；2 个 reference doc 要随移；backwards-compat alias 保平 |
| **Test 覆盖** | HIGH | fixture pattern 成熟（createFixtureSpec）；新 hook 5 个 case + Stop 扩展 2-3 case |
| **跨平台风险** | LOW | 4-leg CI matrix 已就绪；cross-platform-support spec 把已知坑都修了 |

## Recommendations for Requirements Phase

1. **承认 TaskCompleted 不是 GA，调整闸门策略**：
   - **Stop hook = 主闸**（强制，所有用户）
   - **TaskCompleted = 第二层 opt-in**（仅当 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 时启用）
   - 文档明确写出双层模型，避免后续混淆
2. **铁律不光在 hook**：reference doc + state file + hook 三处冗余落地 —— 抗 compaction
3. **stop_hook_active 是不是 undocumented 这个事更新 epic 资料**：研究稿要纠正"undocumented but real"
4. **VerificationBlock schema 在 design 阶段定稿**：上面的 TS 接口是建议草稿，design 阶段要决定 (a) 是 array 还是 object map (b) 是否需要 `srcMtime` 字段（用于 staleness check）(c) 是否需要 `command` + `exitCode` 字段
5. **VF 任务 vs verification block 的关系**：现有 VF 任务 + qa-engineer agent 流程不动；新增 verification block 是另一个层次（phase-level、commit-level）。requirements 要明确两者关系（互补，不替代）
6. **commit/tag/release 闸怎么挂**：不是 hook（git/npm 不走 Claude hook 系统），而是走 `npm run verify` 检查清单 + `references/iron-law-verification.md` 文档约束。在 design 阶段定。

## Open Questions（留给 design / requirements）

1. **TaskCompleted hook 是否纳入 v1**？两条路：
   - A) 全做（Stop 主闸 + TaskCompleted 二层）—— 用户面更全，复杂度高
   - B) 只做 Stop 主闸 —— 简单、覆盖所有用户，少一层防御
2. **verificationBlocks 字段类型**（array vs object map）—— design 决
3. **commit/tag/release 闸的实现介质**：纯 npm scripts？git pre-commit？还是依赖外部 verify 命令？
4. **Reality-verification rename 是否需要 dual-name 兼容期**？多久？
5. **Stop hook 的 `stop_hook_active` early-exit 与 spec E（cost-runaway-guards）的同名 guard 是否合并到一处**？避免双实现。

## Sources

### Anthropic 官方
- Hooks reference: https://code.claude.com/docs/en/hooks
- Agent Teams docs: https://code.claude.com/docs/en/agent-teams
- Hooks guide / troubleshooting (含 stop_hook_active 示例): https://code.claude.com/docs/en/hooks-guide
- SDK docs: https://code.claude.com/docs/en/sdk

### 实战参考
- disler/claude-code-hooks-mastery (stop.py 标杆): https://github.com/disler/claude-code-hooks-mastery
- claude-code GH issue #10205 / #3573 / claude-mem GH issue #1288 (无限 loop 实锤)

### 局部研究产物（已合并，可删除）
- `.research-anthropic-docs.md` (R1, 245 行 + 24 引用)
- `.research-hook-framework.md` (E2, 512 行)
- `.research-reality-verification-skill.md` (E1, 571 行)
- `.research-test-and-verify.md` (E3, 517 行)

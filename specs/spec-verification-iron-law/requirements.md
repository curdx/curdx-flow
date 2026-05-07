---
spec: spec-verification-iron-law
epic: superpowers-uplift
phase: requirements
created: 2026-05-06
---

# Requirements: spec-verification-iron-law

## Goal

把"没有新鲜证据就不能声称完成"从 reality-verification 单任务作用域提升为通用铁律 hook，覆盖 task / phase exit / commit / tag / release 所有声称点。铁律以**双层模型**落地：Stop hook（GA、强制、所有用户）为主闸；TaskCompleted hook（Agent Teams opt-in）为加固层；并以 hook + state + reference doc 三处冗余抗 compaction。

## Success Criteria (epic-level outcome)

- 任何"完成声称"（task / phase exit / commit / tag / release）若无 fresh、机器可读的 verification 证据，必被 Stop hook 阻断；用户在 stderr 拿到可执行的修复指引。
- 即使 Claude session 被 compact，铁律仍生效 —— 因 hook 在 LLM context 之外执行，state file 与 reference doc 提供二次冗余。
- 启用了 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 的用户额外获得 TaskCompleted 二层防护，但所有用户（不开 Agent Teams）也能拿到完整 Layer-1 保护。
- 现有 reality-verification skill 用户和下游引用（4 个文件）零破坏过渡到 verification-before-completion。
- ubuntu 20/22 + macos 22 + windows 22 CI matrix 全绿；无 autonomous-loop 烧 token 风险。

## Glossary

- **Iron law**: 强制规则——任何"完成声称"都必须有未过期的、机器可读的验证证据。
- **Verification block**: 写入 `.curdx-state.json` 的结构化记录，至少含 id / name / status / verifiedAt 字段，证明某个验证点已在源码最新版本上跑过且通过。
- **Fresh evidence**: `verifiedAt` 时间戳 ≥ 相关源文件的最后 mtime；过期则视为无效。
- **Stop hook (mandatory)**: Claude Code GA 的 lifecycle hook；在 model-finished 时触发；本 spec 的**主闸**，所有用户路径必经。
- **TaskCompleted (opt-in)**: Claude Code Agent Teams research preview hook；仅当 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 时 fire；本 spec 的**第二层加固**。
- **stop_hook_active**: Stop hook stdin 字段；true 表示当前 stop 已被某个 hook block 过；用于 early-exit 防递归。Anthropic 官方 troubleshooting 文档已示例化。
- **Verification token**: verification block 在被消费侧（commit/release gate）认可的最小单位 —— 由 hook 写入、由检查脚本读取。
- **VF task**: 现有 reality-verification skill 在 fix-type spec 中生成的 BEFORE/AFTER 复现任务；与 verification block **互补**而非替代。
- **Layer-1 / Layer-2**: Layer-1 = Stop hook 主闸（必经）；Layer-2 = TaskCompleted opt-in 加固（仅 Agent Teams）。
- **Compaction resilience**: 即便 LLM context 被压缩、prose 被丢弃，规则仍生效的属性。

## Personas

### Primary: curdx-flow plugin user (developer running the workflow)

跑 `/curdx-flow:start` 推进 spec 的开发者；今天最痛的是 Claude 在 phase 边界 / commit 前频繁谎称"完成"，回头发现命令没真跑过、测试没真过。希望系统在错误声称发生时**立即**截停并告诉自己缺什么证据，而不是事后人肉 audit。

### Secondary: curdx-flow plugin maintainer (us, future selves)

负责保持 plugin 在多版本 Claude Code、多操作系统下 100% 后向兼容的人。最不能接受的是：删字段、改 hook 默认行为、让旧 skill 名失效、autonomous-loop 烧 token、CI matrix 出现红 leg。

## User Stories

### US-1: Layer-1 mandatory Stop gate blocks unverified completion claims

**As a** plugin user **I want** Stop hook 在我（或 Claude）声称"phase 完成"时校验存在 fresh verification block **so that** 没有真证据就不能离开当前 phase。

**Acceptance Criteria:**
- AC-1.1 **Given** 当前 spec phase 已声称完成且 `.curdx-state.json` 含至少一个 status=passed 且 fresh 的 verification block，**When** Stop hook 触发，**Then** 放行（exit 0），phase 推进。
- AC-1.2 **Given** 当前 phase 声称完成但 `verificationBlocks` 缺失或为空，**When** Stop hook 触发，**Then** 返回 `{"decision":"block","reason":...}` 或 exit code 2，stderr 列出缺失的 block id 与建议修复命令。
- AC-1.3 **Given** verification block 存在但 status ∈ {pending, failed}，**When** Stop hook 触发，**Then** 阻断，stderr 报告 failedReason。
- AC-1.4 **Given** verification block 存在且 status=passed 但 verifiedAt 早于源文件 mtime，**When** Stop hook 触发，**Then** 阻断，stderr 标注"stale evidence"。
- AC-1.5 **Given** Layer-1 不依赖任何 env var，**When** 用户从未启用 Agent Teams，**Then** Stop gate 仍 100% 生效。

### US-2: Layer-2 opt-in TaskCompleted reinforces when Agent Teams enabled

**As an** Agent Teams 用户 **I want** TaskCompleted hook 在每个 subagent task 收尾时再校验一遍证据 **so that** 即使 task 漏写 verification block，子代理收尾时仍被截停。

**Acceptance Criteria:**
- AC-2.1 **Given** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 启用且 task_status=completed 但对应 verification block 缺失/过期，**When** TaskCompleted hook 触发，**Then** 阻断并返回可执行修复指引。
- AC-2.2 **Given** Agent Teams **未**启用，**When** 任何 task 完成，**Then** TaskCompleted hook 不 fire 也不影响主流程；Layer-1 仍是唯一闸门。
- AC-2.3 **Given** TaskCompleted 与 Stop 都 fire，**When** 同一证据缺失被两层都检测到，**Then** 用户至多见到一次重复阻断（结果幂等，不双倍噪声）。
- AC-2.4 **Given** TaskCompleted hook 实现存在但运行环境的 Claude Code 不支持该事件，**When** plugin 加载，**Then** 不报错、不破坏其他 hook。

### US-3: Compaction-resilient iron law lives in three places

**As a** maintainer **I want** 铁律以 hook 代码 + state file + reference doc 三处冗余存在 **so that** LLM context 被 compact 后仍能强制执行。

**Acceptance Criteria:**
- AC-3.1 **Given** plugin 安装完成，**When** 检查文件系统，**Then** 存在 (a) `plugins/curdx-flow/hooks/scripts/task-completed-verifier.mjs` + 扩展过的 stop-watcher (b) `.curdx-state.json` schema 含 `verificationBlocks` 字段 (c) `plugins/curdx-flow/references/iron-law-verification.md`。
- AC-3.2 **Given** Claude session 触发 compaction 丢弃所有 prose，**When** 下一次 Stop 触发，**Then** hook 仍读 state file 强制规则，不依赖 LLM 记忆。
- AC-3.3 **Given** reference doc 存在，**When** 任何 agent / command read 该文档，**Then** 拿到与 hook 行为一致的规则描述（单一真相源 + 文档引用）。

### US-4: Skill rename with backwards-compat alias

**As an** existing user 引用 `reality-verification` skill **I want** rename 不破坏我已有的 4 个下游引用 **so that** 升级是无感的。

**Acceptance Criteria:**
- AC-4.1 **Given** 升级后 plugin，**When** 任何下游文件按旧名 `reality-verification` 引用，**Then** 通过 alias / stub 重定向到 `verification-before-completion`，行为等价。
- AC-4.2 **Given** rename 完成，**When** 新 skill 目录结构检查，**Then** 包含原 SKILL.md 升级版 + 完整保留的 `references/goal-detection-patterns.md` 与 `references/mock-quality-checks.md`。
- AC-4.3 **Given** 新 SKILL.md，**When** 检查 description 字段长度，**Then** ≤ 1,536 字符，并显式列出触发关键词。
- AC-4.4 **Given** 升级后，**When** 跑现有 fix-type spec 的 VF 任务流程，**Then** BEFORE/AFTER 复现 + mock 反模式拦截行为不变。

### US-5: Schema migration is purely additive

**As a** maintainer **I want** `.curdx-state.json` 加 `verificationBlocks` 是纯加项 **so that** 旧 state 文件可被新 hook 直接读、新 state 文件可被旧 hook 忽略 unknown 字段。

**Acceptance Criteria:**
- AC-5.1 **Given** 旧 state 文件无 `verificationBlocks` 字段，**When** 新 hook 读取，**Then** 视为空数组/对象，不抛错。
- AC-5.2 **Given** 新 state 文件含 `verificationBlocks`，**When** 任何旧逻辑读取，**Then** 忽略未知字段，已有字段语义不变。
- AC-5.3 **Given** schema 变更，**When** 检查版本号，**Then** PATCH bump 即可（无需 MAJOR/MINOR）。
- AC-5.4 **Given** state-completion-marker 已 ship 的 `completed` / `completedAt` 字段，**When** 与 `verificationBlocks` 共存，**Then** 互不覆盖、语义独立。
- AC-5.5 **Given** TS 接口 `CurdxState` 与 `spec.schema.json`，**When** check-versions / typecheck 跑过，**Then** 双源同步无 drift。

### US-6: Stop loop self-defense via stop_hook_active

**As a** plugin user **I want** Stop hook 入口立即检查 `stop_hook_active` **so that** 不会因为 hook 的 block 决定再次触发自己造成无限循环。

**Acceptance Criteria:**
- AC-6.1 **Given** Stop hook stdin 含 `stop_hook_active=true`，**When** hook 入口判断，**Then** 立即返回（不再校验、不再 block），exit 0 / `{continue: false}`。
- AC-6.2 **Given** Stop hook stdin 含 `stop_hook_active=false` 或字段缺失，**When** hook 入口判断，**Then** 进入正常校验流程。
- AC-6.3 **Given** 错误情境模拟（hook 反复 block 同一 stop），**When** 集成测试运行，**Then** 至多触发 1 次 block；不进入递归。
- AC-6.4 **Given** 该 guard 与 spec E (cost-runaway-guards) 计划的同名 guard 在同一文件，**When** 两 spec 都落地，**Then** 不出现双实现（A 先落框架、E 后扩展不冲突）。

### US-7: Cross-platform CI matrix all green

**As a** maintainer **I want** 新 hook 在 ubuntu 20 / ubuntu 22 / macos 22 / windows 22 全跑过 **so that** 任何平台用户安装后即可工作。

**Acceptance Criteria:**
- AC-7.1 **Given** PR / merge 触发 CI，**When** 4-leg matrix 跑完，**Then** 4 leg 全绿。
- AC-7.2 **Given** Windows 平台路径分隔符为 `\`，**When** hook 处理 spec / state file 路径，**Then** 跨平台正确（用 path.join，不 hardcode `/`）。
- AC-7.3 **Given** `mtimeMs` 单位为毫秒、`verifiedAt` 为 ISO 8601，**When** 比对 staleness，**Then** 单位换算正确（除 1000 或同源 ms）。
- AC-7.4 **Given** spawnSync stdout/stderr 在 Windows 可能 undefined，**When** hook 解析子进程输出，**Then** 用 nullish-coalesce 保护不崩。
- AC-7.5 **Given** fixture 行尾 LF vs CRLF 差异，**When** 测试断言文本，**Then** 行尾 normalize 后比对。

### US-8: Commit / tag / release boundary verification

**As a** plugin user **I want** 在 commit / tag / release 边界，铁律也能强制执行 **so that** 不能跳过 phase exit 直接发版。

**Acceptance Criteria:**
- AC-8.1 **Given** `npm run verify` 是 release 闸门，**When** 任何 verification block 缺失或过期，**Then** verify 失败、release pipeline 不继续。
- AC-8.2 **Given** `references/iron-law-verification.md` 检查清单存在，**When** 维护者读它，**Then** 清楚 commit / tag / release 三个边界各自需要的 block id 与时间戳约束。
- AC-8.3 **Given** verification block 时间戳 ≥ 最近一次 src 改动 mtime，**When** verify 检查，**Then** 通过；反之 fail 并明示哪个 src 比 verifiedAt 更新。
- AC-8.4 **Given** commit/tag/release 边界 **不**走 Claude hook 系统（git/npm 不跑 Claude hook），**When** 实现 gate，**Then** 通过 npm script + reference 检查清单实现，与 hook 闸独立但语义一致。

### US-9: Actionable error messages on block

**As a** plugin user **I want** 当 hook block 我时，stderr 给我**可执行**修复步骤 **so that** 我知道下一步跑什么命令。

**Acceptance Criteria:**
- AC-9.1 **Given** block 触发，**When** 用户读 stderr，**Then** 含 (a) 缺失/过期的 block id 与 name (b) 推荐修复命令或 reference doc 链接 (c) 当前 spec phase 上下文。
- AC-9.2 **Given** 错误信息，**When** 用户在终端复制粘贴第一行命令，**Then** 该命令可独立运行（不需要再编辑）。
- AC-9.3 **Given** 多个 block 同时失败，**When** stderr 输出，**Then** 一次列出全部，避免用户挤牙膏式 retry。

### US-10: Hook performance budget acceptable

**As a** plugin user **I want** Stop / TaskCompleted hook 不让我感觉卡顿 **so that** 体验不打折。

**Acceptance Criteria:**
- AC-10.1 **Given** typical .curdx-state.json (≤ 100 KB)，**When** hook 跑完一次校验，**Then** 平均耗时 ≤ 200ms（本机 vitest 集成测）。
- AC-10.2 **Given** hook 启动到退出，**When** 测延迟，**Then** P95 ≤ 500ms。
- AC-10.3 **Given** hook 校验涉及读多个 src 文件 mtime，**When** 文件数 ≤ 1000，**Then** 不出现 O(N²) 行为。

## Functional Requirements

### FR-Hook (Hook system)

- FR-1: 必须新增 `TaskCompleted` 事件注册到 `plugins/curdx-flow/hooks/hooks.json`，源 `src/hooks/task-completed-verifier.ts` → bundled `.mjs`。
- FR-2: 必须扩展 `stop-watcher.mjs`，在原 `phase === "execution" && taskIndex >= totalTasks` 路径之外，校验 `verificationBlocks` 数组所有项 status=passed 且 fresh。
- FR-3: Stop hook 入口必须检查 `stop_hook_active` 字段；为 true 时立即 short-circuit 返回。
- FR-4: 新增 hook 必须经 `scripts/build-hooks.mjs` esbuild bundle；CI `npm run check:hooks-fresh` 必须通过。
- FR-5: TaskCompleted hook 在 Agent Teams 未启用环境必须 graceful no-op；不抛错、不污染日志。
- FR-6: hook block 时必须返回 exit 2 或 `{"decision":"block","reason":...}`，stderr 含 actionable 修复信息。

### FR-State (State schema)

- FR-7: `CurdxState` 接口（`src/hooks/_shared/types.ts`）必须新增 optional `verificationBlocks` 字段。
- FR-8: `spec.schema.json` 必须同步加 `verificationBlocks` 节点，与 TS 接口语义一致。
- FR-9: 字段是纯加项；现有字段（含 state-completion-marker 加的 `completed` / `completedAt`）语义、位置、序列化顺序不得变更。
- FR-10: 所有 `verificationBlocks` 写入必须经 `merge-state.ts` 原子合并通道（temp + rename + pid + random hex）。
- FR-11: 旧 state 文件无该字段时，hook 必须按"空"处理；新 state 文件含该字段时，旧 hook 不得报错。

### FR-Skill (Skill rename + scope expansion)

- FR-12: `skills/reality-verification/` 必须重命名为 `skills/verification-before-completion/`；保留同名 alias / stub 重定向旧路径。
- FR-13: `references/goal-detection-patterns.md` 与 `references/mock-quality-checks.md` 必须随 skill 一并迁移到新目录，内容不丢失。
- FR-14: 新 SKILL.md description 字段 ≤ 1,536 字符，含显式 trigger keywords。
- FR-15: 升级后 skill 必须覆盖 4 个 scope gap：phase-exit / commit-tag-release / 通用完成声称 / evidence staleness。
- FR-16: 4 个下游引用文件（task-planner.md L290 / count-mocks.ts L5 / lib/README.md L42 / state file L15）必须或同步改名、或通过 alias 透明工作。

### FR-Doc (Reference doc)

- FR-17: 必须新增 `plugins/curdx-flow/references/iron-law-verification.md`，含双层模型说明 + commit/tag/release 检查清单 + verification block 字段定义。
- FR-18: reference doc 描述的规则必须与 hook 实际行为一致（单一真相源 + 文档引用对齐）。
- FR-19: 必须新增/更新 `CHANGELOG.md` 条目，按 Added / Changed / Fixed 分类记录本 spec 上线 surface。

### FR-Compat (Backwards compatibility)

- FR-20: 不得删除任何现有 hook 事件、命令、agent、skill；不得修改任何现有 state 字段语义。
- FR-21: PATCH 版本 bump 即可（不允许 MAJOR/MINOR 因本 spec 触发）。
- FR-22: 现有 `npm run verify` 步骤顺序不得颠倒；只能在尾部追加新检查或在已有 check-versions / check:hooks-fresh 链路中扩展。
- FR-23: 与 spec E (cost-runaway-guards) 共享 `stop-watcher.mjs` surface 时，本 spec 先落框架，不预占 E 计划的 matcher 路径。

## Non-Functional Requirements

| ID | Requirement | Metric | Target |
|----|-------------|--------|--------|
| NFR-1 | Performance — hook latency | 单次 Stop hook 总耗时 (typical state ≤ 100KB) | mean ≤ 200ms / P95 ≤ 500ms |
| NFR-2 | Compatibility — CI matrix | 4-leg ubuntu20/ubuntu22/macos22/windows22 | 100% green |
| NFR-3 | Observability — error message | block 时 stderr 内容 | 含 block id + 修复命令 + spec context |
| NFR-4 | Maintainability — test coverage | 新 hook + 扩展 stop-watcher 单测 | ≥ 5 case for new hook + ≥ 2-3 case 扩展 stop-watcher |
| NFR-5 | Maintainability — bundle freshness | check:hooks-fresh CI gate | git diff = 0 between source and bundle |
| NFR-6 | Security — input validation | hook stdin parse | 任意 malformed JSON 不崩溃，graceful error |
| NFR-7 | Cost — autonomous loop guard | stop_hook_active early-exit | 任意 fixture stop loop 触发 ≤ 1 次 block |
| NFR-8 | Compaction resilience | 三处冗余存在 | hook 代码 + state schema + reference doc 全部 present |
| NFR-9 | Documentation completeness | reference doc 与 hook 行为一致性 | 文本检查无 drift；double-source review pass |

## Out of Scope (explicit non-goals)

- TaskCompleted 作为**强制**层（mandatory）—— 在 Anthropic GA Agent Teams 之前保持 opt-in。
- 替换或淘汰现有 VF 任务 / qa-engineer agent 流程 —— verification block 是**互补**层（phase / commit / release），不取代 task 级 BEFORE/AFTER。
- 修改 state-completion-marker 已 ship 的 `completed` / `completedAt` 字段语义。
- 新增 brainstorming / writing-plans / executing-plans / TDD-mandate 任何一个作为 skill 或 command（epic 已 CUT）。
- 实现 spec E (cost-runaway-guards) 的 StopFailure matcher 与 max-iterations 收紧（属于 spec E 范围；本 spec 仅落 stop_hook_active early-exit 与共享 surface 框架）。
- 修改 spec backbone command 顺序（research → requirements → design → tasks → execution 不变）。
- metrics / dashboard（plugin-observability 已完成，需要时复用）。

## Dependencies

### Internal

- 必须 sequence after `state-completion-marker`（已于 2026-05-05 完成，schema 稳定）；避免 schema 字段冲突。
- 为 `spec-two-stage-review`（B）提供 verification token 作为 review 通过凭证。
- 为 `spec-subagent-context-reinjection`（D）提供 iron-law 摘要文本与生成函数。
- 为 `spec-cost-runaway-guards`（E）共享 `stop-watcher.mjs` 文件 surface（A 先落框架，E 后扩 matcher）。

### External (Anthropic platform)

- Stop hook（GA、确认）— Layer-1 主闸基础。
- TaskCompleted hook（Agent Teams research preview，opt-in via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`）— Layer-2 加固。
- `stop_hook_active` stdin 字段（officially documented in hooks-guide troubleshooting）— Stop loop self-defense 基础。

## Open Questions for Design Phase

1. **TaskCompleted hook 是否纳入 v1**？research 推荐 Layer-2 opt-in 实现（路径 A）；design 阶段需确认是否完整实现 vs 仅留接口骨架。
2. **`verificationBlocks` 数据结构**：array of records vs object map keyed by phase？research 建议 array；design 定稿（影响 stale 检测算法、并发写、查询 ergonomics）。
3. **commit / tag / release gate 实现介质**：纯 npm scripts？git pre-commit hook？还是依赖外部 verify 命令？需在 design 阶段定。
4. **Skill rename dual-name 兼容期时长**：永久 alias vs N 个版本后下线？影响下游升级压力。
5. **`stop_hook_active` early-exit 与 spec E 同名 guard 是否合并到一处共享代码**？避免双实现；design 决定文件 owner 与 import 边界。
6. **VerificationBlock 是否需要 `command` / `exitCode` / `srcMtime` 字段**？影响 staleness 检测精度；research 标为 design-decision。

## Risks (carried from research; design phase to mitigate)

1. **state-completion-marker schema 冲突** (Severity: Medium) — 两 spec 都改 `.curdx-state.json`。Mitigation: A 启动前 `git pull` + diff schema；冲突让位 marker。
2. **Hook surface 模糊（A 与 spec E 共享 stop-watcher.mjs）** (Severity: Medium) — 文件 owner 重叠。Mitigation: A 先 merge 框架，E 后追加 matcher；用 plan.md owner files 锁定。
3. **Skill rename 下游引用遗漏** (Severity: Medium) — 4 个文件需同步。Mitigation: rename 任务必须 grep 全仓库验证 `reality-verification` 文本残留 = 0（除 alias stub）。
4. **TaskCompleted Agent Teams 条件覆盖不全** (Severity: Low) — 用户不知道何时 Layer-2 生效。Mitigation: reference doc 必须显式说明 env var 触发条件 + Layer-1 单独足够保护的承诺。
5. **跨平台 mtime / 路径分隔符 bug** (Severity: Low) — Windows leg 易出问题。Mitigation: 沿用 cross-platform-support spec 已修通的 fixture 模板（tmpdir / mkdtempSync / nullish-coalesce / ms vs s 单位）。

## Validation Strategy

参考 research.md §Test + Verify Pipeline，本 spec 要求的验证策略：

1. **Unit + fixture integration tests** (`tests/hooks/task-completed-verifier.test.ts` + 扩展 `tests/hooks/stop-watcher.test.ts`)：
   - new hook ≥ 5 case：valid block / missing block / stale timestamp / malformed block / error stdin
   - stop-watcher 扩展 ≥ 2-3 case：verificationBlocks 校验通过 / 校验失败 / `stop_hook_active=true` short-circuit
2. **Cross-platform CI matrix**：4-leg ubuntu20/ubuntu22/macos22/windows22 必须全绿。
3. **Bundle freshness**: `npm run check:hooks-fresh` 必须 pass（源 ↔ bundle git diff = 0）。
4. **Schema double-source sync**: TS interface (`CurdxState`) 与 `spec.schema.json` 双源一致；typecheck + check-versions 双 gate。
5. **End-to-end fixture spec**: 起 fixture 跑到 phase exit 不写 verification block → 确认 Stop hook exit 2；改 src 文件再立刻声称 done → 确认 timestamp 比对 fail。
6. **Backwards-compat smoke**: 用旧 `reality-verification` skill 名调用 → 确认 alias 重定向工作；现有 fix-type spec VF 任务流程跑通不变。
7. **Performance gate**: 在典型 state file 上 micro-benchmark ≤ 200ms mean / ≤ 500ms P95。
8. **Release-boundary check**: `npm run verify` 在 verification block 缺失/过期场景应 fail，含 `references/iron-law-verification.md` 检查清单可执行。

## Next Steps

1. 用户审核 requirements.md，确认双层模型 + 6 个 open question 范围。
2. 进入 design phase（`/curdx-flow:design`），定稿 verificationBlock 数据结构、TaskCompleted v1 取舍、stop_hook_active 与 spec E 的共享代码边界、commit/tag/release gate 实现介质。
3. design 完成后进入 tasks phase 拆分 L 大小（20-40 任务）。
4. 与 spec E 协调 `stop-watcher.mjs` 文件 owner 时序（A 先 merge）。
5. 在 implementation 进入前 grep 全仓 `reality-verification` 引用，列出 rename 同步清单作为 task。

# Story 1.6: Hook Gate-Only 完成保护边界测试

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为 curdx-flow 维护者，
我希望 Stop、TaskCompleted、PostToolBatch 等 hooks 只做低延迟门禁、状态保护和缺证据提示，
以便 hooks 不会变成脆弱的 planner、长任务执行器或第二套 `/goal` continuation loop。

## Acceptance Criteria

1. **Gate-only 边界：** 给定 Claude Code 触发 Stop、TaskCompleted、PostToolBatch、PostCompact 或 StopFailure hook，当 hook 处理输入 payload 时，必须通过薄入口读取必要状态、执行轻量 gate 或上下文注入；不得启动 dev server、运行 Playwright、调用外部 MCP、执行复杂推理、自动修复源码或执行 release gate。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.6`]
2. **stdout/stderr 协议：** 给定 hook 需要输出 Claude Code 协议结果，当 hook 写 stdout 时，stdout 必须只包含事件允许的结构化 JSON 或明确允许的上下文输出；diagnostics、debug、warning、异常信息必须写 stderr 或 runtime log，不得污染 stdout。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.6`; `_bmad-output/planning-artifacts/architecture.md#IP-HOOK-002 Stdout/Stderr Contract`]
3. **Fail-open：** 给定 hook 遇到 malformed stdin、未知字段、缺失旧字段、invalid state 或 runtime helper 异常，当该事件不是明确 gate 场景时，hook 必须 fail-open 并退出 0；诊断信息必须可追踪但不能阻塞 Claude Code 正常使用。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.6`; `_bmad-output/planning-artifacts/architecture.md#IP-HOOK-003 Runtime Budget`]
4. **可阻断 gate：** 给定 TaskCompleted 或 PostToolBatch 发现任务缺少 fresh evidence、存在 missingEvidence 或违反 no false completion，当该事件支持阻断时，hook 可以输出结构化 gate reason 阻止完成或下一轮 agentic loop；gate reason 必须包含缺失证据、下一步动作和对应 runId/goalId。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.6`; `_bmad-output/planning-artifacts/epics.md#Story Requirement Trace`]
5. **Stop 不续跑：** 给定 native `/goal` 是当前 execution driver，当 Stop hook 看到 run 仍在进行时，Stop hook 不得注入 continuation prompt 或形成第二套自治循环；应把下一轮推进交给 `/goal` 或显式 `/curdx-flow:implement` fallback。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.6`; `_bmad-output/planning-artifacts/prd.md#Technical Architecture Considerations`]
6. **状态写入边界：** 给定 hook 写入状态或 snapshot，当写入发生时，写入必须低延迟、原子、可失败恢复；hook 不得直接写 completion verdict 或复杂 evidence ledger 真相。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.6`; `_bmad-output/planning-artifacts/architecture.md#IP-HOOK-001 Gate Only`]
7. **验证覆盖：** 给定 Story 1.6 完成，当执行验证时，最小验证命令必须包含 `npm run build:hooks`、`npm run check:hooks-fresh`、相关 `npm run test:hooks` 或新 hook boundary tests；测试必须覆盖 stdout/stderr、exit code、fail-open、gate block、malformed stdin、missing old fields、native `/goal` active、generated hook freshness。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.6`]

## Tasks / Subtasks

- [x] 固定 hook boundary 测试范围（AC: 1-7）
  - [x] 完整读取 `src/hooks/stop-watcher.ts`、`src/hooks/task-completed-verifier.ts`、`src/hooks/post-tool-batch-snapshot.ts`、`src/hooks/post-compact-recorder.ts`、`src/hooks/stop-failure-handler.ts`、`src/hooks/_shared/run-hook.ts`、`src/hooks/_shared/stdin.ts`、`src/hooks/_shared/types.ts`。
  - [x] 完整读取 `plugins/curdx-flow/hooks/hooks.json`、`scripts/build-hooks.mjs`、`plugins/curdx-flow/schemas/hook-gate.schema.json`、`src/runtime/contracts/index.ts` 中 `HookGateOutput`。
  - [x] 明确区分 shipped `hook-gate.schema.json` 的内部 gate contract 与 Claude Code event-specific stdout schema；不要把所有事件强行套成同一个 stdout shape。

- [x] 增加 hook 协议测试 harness（AC: 1, 2, 3, 7）
  - [x] 新建 `tests/hooks/hook-boundary.test.ts` 或等价文件，通过 `node plugins/curdx-flow/hooks/scripts/*.mjs` 运行生成后的 hook bundle，并向 stdin 写入 JSON payload。
  - [x] 测试 helper 必须捕获 stdout、stderr、exitCode、signal、运行耗时，并使用 `mkdtemp` 创建临时 workspace/spec，不得在仓库根创建 `.curdx/**` 或 `specs/**`。
  - [x] `npm run test:hooks` 已先执行 `npm run build:hooks`；测试应验证 generated bundle 行为，不只 import TypeScript helper。
  - [x] 若新增 helper 需要被多个测试复用，放在 `tests/hooks/helpers` 或测试文件本地；不要把测试专用逻辑塞进 shipped hook runtime。

- [x] 覆盖 fail-open 与 stdout/stderr 规则（AC: 2, 3, 7）
  - [x] malformed stdin：Stop、TaskCompleted、PostToolBatch、PostCompact、StopFailure 均不得以非 0 退出；stdout 不得含 debug/diagnostic 文本。
  - [x] unknown future fields：各 hook 必须忽略未知字段并保持 event-specific 输出合法。
  - [x] missing old fields：缺 `cwd`、缺 `session_id`、缺 `task_id`、缺 `tool_calls`、缺 `transcript_path` 时必须按事件语义 fail-open 或 no-op，不得抛错污染 stdout。
  - [x] runtime helper exception：对非明确 gate 场景必须 exit 0；diagnostic 走 stderr 或 `~/.claude/curdx-flow/errors.jsonl`，不得进入 stdout。

- [x] 覆盖 gate block 与 no false completion（AC: 4, 6, 7）
  - [x] 构造临时 spec `.curdx-state.json`，覆盖 TaskCompleted 在 known verification phase、缺 verification block、failed verification block、stale execution taskIndex 等 gate 场景的阻断行为。
  - [x] gate block 输出必须结构化、可被 Claude Code 消费；stderr 或 stdout 内容必须包含缺失证据/verification reason、next action 或 rerun command、runId/goalId 或可追溯 spec/run identity。
  - [x] 对 state malformed、invalid old state、phase unknown、无 active spec 的路径必须证明 fail-open，不得把无法定位的状态伪装成完成或阻塞整个 Claude Code。
  - [x] hook 不得直接写 completion verdict 或 evidence ledger；如需要记录 observability，只能追加轻量 snapshot/brain event，并测试写入失败时 fail-open。

- [x] 覆盖 Stop hook `/goal` 边界（AC: 1, 5, 7）
  - [x] 当 state phase 为 execution 且 taskIndex < totalTasks 时，Stop hook 应 exit 0，不输出 continuation prompt；stderr 可提示 native `/goal` 或显式 `/curdx-flow:implement` 继续驱动。
  - [x] `stop_hook_active === true` 必须短路 no-op，避免 Stop hook re-entry loop。
  - [x] ALL_TASKS_COMPLETE 只触发确定性 verificationBlocks gate；不得把 Stop 变成长任务 planner 或自动续跑器。
  - [x] 测试必须断言 stdout 不包含 continuation instruction、planner prompt、Playwright/dev-server/MCP 调用痕迹。

- [x] 修正任何测试暴露的 hook 边界违规（AC: 1-7）
  - [x] 修改 `src/hooks/**` 或 `src/hooks/lib/**` 时保持 hook entrypoint thin；复杂规则进入共享 helper，入口只负责 stdin parse、状态读取、helper 调用和 event-specific 输出。
  - [x] 不手改 `plugins/curdx-flow/hooks/scripts/**`；只通过 `npm run build:hooks` 生成。
  - [x] 不修改 plugin manifest、skill、agent、registry、dependency 或 release tag，除非测试证明 hook wiring 本身错误。
  - [x] 不实现 Story 2 capability doctor、Story 4 browser/API probes、Story 5 recovery retry、Story 6 release dry-run。

- [x] 更新脚本、验证和 story 记录（AC: 7）
  - [x] 确保 `npm run test:hooks` 会执行新 hook boundary tests；如需要新增更窄脚本，可加 `npm run test:hooks:boundary` 并接入 `verify`，但不得削弱现有 `test:hooks`。
  - [x] 运行 `npm run build:hooks`、`npm run check:hooks-fresh`、`npm run test:hooks`、`npm run typecheck`、`npm run verify`。
  - [x] 若 hook wiring 或 plugin-facing schema/manifest 变化，运行 `claude plugin validate ./plugins/curdx-flow`；若只改 hook source/tests，仍应确认 `check:hooks-fresh` 通过。
  - [x] 在 Dev Agent Record 记录实现计划、验证命令、文件列表和任何未覆盖风险。

## Dev Notes

### 当前发现

- `plugins/curdx-flow/hooks/hooks.json` 当前 wiring 包含 `Stop`、`TaskCompleted`、`PostToolBatch`、`PostCompact`、`StopFailure`，命令均通过 `${CLAUDE_PLUGIN_ROOT}/hooks/scripts/*.mjs` 指向 generated bundles。[Source: `plugins/curdx-flow/hooks/hooks.json`]
- `scripts/build-hooks.mjs` 从 `src/hooks/*.ts` 与 `src/hooks/lib/*.ts` 生成 `plugins/curdx-flow/hooks/scripts/*.mjs`；本 story 如修改 hook source，必须通过 build 脚本生成并用 `check:hooks-fresh` 验证。[Source: `scripts/build-hooks.mjs`]
- 当前 `tests/hooks/` 目录没有实际 hook protocol tests；`npm run test:hooks` 依赖 `--passWithNoTests`，因此 Story 1.6 必须新增真实测试而不是只依赖 hook freshness。[Source: `package.json`; `tests/hooks` inventory]
- `stop-watcher.ts` 已声明 native `/goal` 是 execution driver，Stop hook 不再注入 continuation prompt；Story 1.6 需要把这个行为用测试锁住。[Source: `src/hooks/stop-watcher.ts`]
- `task-completed-verifier.ts` 当前直接读 stdin、写 `{continue:true}` 或 stderr + exit 2；它没有走 `runHook`，所以 fail-open、stdout/stderr、exit code 必须被单独测试。[Source: `src/hooks/task-completed-verifier.ts`]
- `post-tool-batch-snapshot.ts` 当前只在写入类 tools 后输出 `hookSpecificOutput.additionalContext`，并在异常时 fail-open；测试应覆盖无写入 tools、malformed stdin、写入 tools 三类路径。[Source: `src/hooks/post-tool-batch-snapshot.ts`]
- `post-compact-recorder.ts` 和 `stop-failure-handler.ts` 是 observability-only；它们不得 block、不得输出非协议 stdout，不得把 StopFailure 当成重试或续跑机制。[Source: `src/hooks/post-compact-recorder.ts`; `src/hooks/stop-failure-handler.ts`]
- `hook-gate.schema.json` 与 `HookGateOutput` 已存在，但它是 curdx-flow 内部 gate output contract；Claude Code hook stdout 对不同事件有不同 shape，不能用一个 schema 覆盖所有 stdout。[Source: `plugins/curdx-flow/schemas/hook-gate.schema.json`; `src/runtime/contracts/index.ts`]

### Previous Story Intelligence

- Story 1.5 建立 `src/runtime/reports/**`，报告层只消费 state/evidence/verdict/blockers，不重新计算 completion truth。Story 1.6 的 hook gate 也应保持同一原则：hook 可 gate 或提示，但不拥有 completion truth。[Source: `_bmad-output/implementation-artifacts/1-5-human-machine-readable-evidence-reports.md`]
- Story 1.5 review 修复了“脱敏不能改变结构化合同形状”的问题。Story 1.6 也必须避免为了方便测试或输出而改变 Claude Code event-specific stdout schema。[Source: `_bmad-output/implementation-artifacts/1-5-human-machine-readable-evidence-reports.md#Review Findings`]
- Story 1.3 已建立 workspace-local `.curdx/**` 边界；hook tests 必须使用临时 workspace，不得在仓库根写 `.curdx/**` 或真实用户 state。[Source: `_bmad-output/implementation-artifacts/1-3-run-state-recovery-context-workspace-boundary.md`]
- Story 1.4 已建立 completion verdict evaluator；Story 1.6 不应在 hooks 中重新实现 verdict evaluator，只测试/修正 hooks 对缺证据、verification block、state 的轻量 gate 行为。[Source: `_bmad-output/implementation-artifacts/1-4-completion-verdict-evaluator.md`]
- 最近完整 gate 已通过 `npm run verify` 和 `claude plugin validate ./plugins/curdx-flow`；本 story 不得降低这些 gate。[Source: `_bmad-output/implementation-artifacts/1-5-human-machine-readable-evidence-reports.md#Debug Log References`]

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户不再担心 hooks 卡死 Claude Code、污染 stdout、偷偷续跑或伪造完成。 |
| Runtime Directory | 主要修改 `src/hooks/**` / `src/hooks/lib/**`；如需内部 normalization helper，可新增 `src/runtime/hook-gate/**`，但不得承载复杂 planner。 |
| Plugin Surface | `plugins/curdx-flow/hooks/hooks.json` 只在 wiring 被证明错误时修改；generated bundles 只由 `npm run build:hooks` 更新。 |
| Schema | 复用 `plugins/curdx-flow/schemas/hook-gate.schema.json`；如新增内部 hook gate fields，必须同步 schema、TypeScript、fixtures、contract tests。 |
| Contract Test | 已有 `tests/contracts/runtime-contracts.test.ts` 覆盖 hookGate baseline；若 schema 改动，扩展该测试和 fixtures。 |
| Runtime/Hook Test | 新增 `tests/hooks/hook-boundary.test.ts` 覆盖 protocol、fail-open、gate-only、stdout/stderr。 |
| Adapter Test | 不涉及外部 adapter；不得调用 MCP/Playwright/dev server。 |
| Fixture | 使用 `mkdtemp` 创建临时 workspace/spec/state/transcript fixtures；不要提交大型 fixture。 |
| Evidence Output | 本 story 不写 runtime evidence ledger；只允许 hook observability/snapshot 写入临时 workspace 或已有 hook brain log，并验证失败恢复。 |
| Report Surface | 无新 report renderer；必要时 gate reason 必须能被后续 report/goal summary 消费。 |
| Failure Mode | malformed stdin、missing old fields、invalid state、runtime helper throw、missing verification block、Stop in-progress no continuation。 |
| Verification Commands | `npm run build:hooks`、`npm run check:hooks-fresh`、`npm run test:hooks`、`npm run typecheck`、`npm run verify`，必要时 `claude plugin validate ./plugins/curdx-flow`。 |

### Implementation Shape Guidance

建议测试 helper 形态：

```ts
runHookScript({
  script: 'task-completed-verifier.mjs',
  stdin: { hook_event_name: 'TaskCompleted', cwd, session_id, task_id },
}): Promise<{ stdout: string; stderr: string; exitCode: number | null; signal: NodeJS.Signals | null }>
```

建议临时 fixture 形态：

```text
<tmp>/
  specs/
    .current-spec
    story-1-6/
      .curdx-state.json
      tasks.md
      transcript.jsonl
```

对于 Stop hook：

- in-progress execution：stdout 应为空，exit 0，stderr 可以说明 native `/goal` 或显式 `/curdx-flow:implement` 继续。
- ALL_TASKS_COMPLETE + missing verification block：允许 structured block；必须是 gate，不是 continuation prompt。
- malformed stdin / missing cwd：exit 0，不输出 debug stdout。

对于 TaskCompleted：

- malformed stdin、wrong event、missing task_id、no active spec、phase unknown：exit 0，stdout 只能为空或事件允许的 pass-through JSON，不得输出 debug 文本。
- known phase + missing/failed/stale verification：可以 block；输出必须可执行并包含 run/spec identity、rerun command/next action。
- runtime helper throw 不得在非 gate 场景 exit 非 0。

### Files To Read Before Editing

**UPDATE candidates:**

- `src/hooks/stop-watcher.ts`
- `src/hooks/task-completed-verifier.ts`
- `src/hooks/post-tool-batch-snapshot.ts`
- `src/hooks/post-compact-recorder.ts`
- `src/hooks/stop-failure-handler.ts`
- `src/hooks/_shared/run-hook.ts`
- `src/hooks/_shared/stdin.ts`
- `src/hooks/_shared/types.ts`
- `src/hooks/lib/verify-blocks.ts`
- `src/hooks/lib/check-verification-blocks.ts`
- `plugins/curdx-flow/schemas/hook-gate.schema.json`
- `src/runtime/contracts/index.ts`
- `package.json`

**READ for context:**

- `plugins/curdx-flow/hooks/hooks.json`
- `scripts/build-hooks.mjs`
- `scripts/check-hooks-fresh.mjs`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/fixtures/contracts/valid/contracts.json`
- `tests/fixtures/contracts/valid/unknown-fields.json`
- `tests/fixtures/contracts/invalid/*.json`
- `_bmad-output/implementation-artifacts/1-3-run-state-recovery-context-workspace-boundary.md`
- `_bmad-output/implementation-artifacts/1-4-completion-verdict-evaluator.md`
- `_bmad-output/implementation-artifacts/1-5-human-machine-readable-evidence-reports.md`

**NEW expected:**

- `tests/hooks/hook-boundary.test.ts`
- Optional local helper inside `tests/hooks/**`
- Optional shared hook boundary helper only if it reduces duplicated production logic across entrypoints

### Architecture Guardrails

- hooks 只能做生命周期门禁、轻量检查、阻断高风险动作、补充被动 evidence、提示缺口；禁止启动长任务、Playwright、dev server、外部 MCP、模型推理、自动修复源码、planner 决策或 release gate。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-HOOK-001 Gate Only`]
- hook stdout 只输出 Claude Code 可消费的结构化协议 JSON；diagnostics/debug/warning/异常写 stderr 或 runtime log。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-HOOK-002 Stdout/Stderr Contract`]
- 每个 hook 必须定义 runtime budget、timeout 行为、失败策略和降级报告；默认 fail-open，只有明确 gate 场景可以 block。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-HOOK-003 Runtime Budget`]
- native `/goal` 是支持环境中的长任务控制入口；hooks 不得定义并行主流程或第二套 continuation loop。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-GOAL-001 Native Goal First`]
- Hook event semantics 必须按官方事件逐项编码和测试；不能假设所有事件都有相同 block/context 行为。[Source: `_bmad-output/planning-artifacts/epics.md#Claude Code Latest-Mechanics Requirements`]
- `TaskCompleted` 和 `PostToolBatch` 可以作为确定性门禁 surface，但必须保持低延迟、协议干净、event-specific 输出正确。[Source: `_bmad-output/planning-artifacts/epics.md#Claude Code Latest-Mechanics Requirements`]
- `plugins/curdx-flow/hooks/scripts/**` 是 generated runtime artifact；不得手改，只能由 `npm run build:hooks` 生成。[Source: `_bmad-output/project-context.md`]

### Latest Claude Code / Library Information

- 官方 Claude Code 文档入口仍以 <https://code.claude.com/docs/llms.txt> 为准；hook 事件、stdout schema、plugin validation 和 `/goal` 相关行为应以当前官方 docs 与本机 `claude` CLI 为准。
- 本 story 不改 plugin dependencies、skills、agents、marketplace、release tags 或 external MCP；如果实现中发现 hook event output schema 与官方 docs 不一致，优先修 source + tests，再通过 `npm run build:hooks` 更新 generated bundles。
- `claude plugin validate ./plugins/curdx-flow` 应在 hook wiring、plugin-facing schema 或 manifest 变更时运行；即使只改 hook source，`npm run check:hooks-fresh` 是必要 gate。

### Known Risks To Prevent

- 不要把 Stop hook 恢复成 continuation prompt loop；当前目标是 `/goal` first。
- 不要让 hook stdout 输出调试文本、ANSI、长段落或异常 stack。
- 不要让 malformed stdin、unknown fields、missing old fields 让 Claude Code hook 以非 0 崩溃。
- 不要让 TaskCompleted 在无法定位 active spec/run 的情况下 block 全局 session。
- 不要把 hook gate tests 写成只测 TypeScript helper；必须跑 generated `.mjs` bundle。
- 不要手动编辑 `plugins/curdx-flow/hooks/scripts/**`。
- 不要在 hook 中调用外部 MCP、Playwright、dev server、release gate 或模型推理。
- 不要把 `hook-gate.schema.json` 等同于所有 Claude Code stdout schema；它是 curdx-flow 内部合同，event-specific stdout 仍需单独测试。
- 不要在仓库根创建 `.curdx/**`、`specs/**` 或临时 runtime state；测试必须使用 `mkdtemp`。

## Project Structure Notes

- Alignment: Story 1.6 接续 Story 1.1 hookGate contract、Story 1.3 state recovery、Story 1.4 no false completion verdict、Story 1.5 transcript/report visibility。
- Detected conflict: 旧 hook 代码仍以 legacy spec `.curdx-state.json` 为主，而 Epic 1 新 runtime 已引入 `StateLedger`/`CompletionVerdict`。本 story 应先锁定 hook boundary 行为，不要求一次性迁移到完整 `.curdx/state/**` runtime；任何迁移必须另有 story 或严格测试覆盖。
- UX note: hook 阻断消息必须短、可执行、可追踪；不能用“内部错误”“验证失败”这类不可操作文案作为唯一输出。

## References

- `_bmad-output/planning-artifacts/epics.md#Story 1.6`
- `_bmad-output/planning-artifacts/epics.md#Story Requirement Trace`
- `_bmad-output/planning-artifacts/prd.md#Technical Architecture Considerations`
- `_bmad-output/planning-artifacts/prd.md#Validation Approach`
- `_bmad-output/planning-artifacts/architecture.md#IP-HOOK-001 Gate Only`
- `_bmad-output/planning-artifacts/architecture.md#IP-HOOK-002 Stdout/Stderr Contract`
- `_bmad-output/planning-artifacts/architecture.md#IP-HOOK-003 Runtime Budget`
- `_bmad-output/planning-artifacts/architecture.md#Story-to-Structure Mapping Contract`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/1-3-run-state-recovery-context-workspace-boundary.md`
- `_bmad-output/implementation-artifacts/1-4-completion-verdict-evaluator.md`
- `_bmad-output/implementation-artifacts/1-5-human-machine-readable-evidence-reports.md`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

- 2026-05-17: Reviewed official Claude Code docs index at `https://code.claude.com/docs/llms.txt`; confirmed hook output/exit-code and `/goal` Stop-hook semantics relevant to this story.
- 2026-05-17: Added generated-bundle hook boundary tests for Stop, TaskCompleted, PostToolBatch, PostCompact, and StopFailure.
- 2026-05-17: Found TaskCompleted unexpected helper exceptions could still exit 2; changed non-deterministic hook faults to fail-open with stderr/error-log diagnostics and `{continue:true}` stdout.
- 2026-05-17: Validation passed: `npm run build:hooks`, `npm run test:hooks`, `npm run typecheck`, `npm run check:hooks-fresh`, `npm run verify`, `claude plugin validate ./plugins/curdx-flow`.
- 2026-05-17: Final audit found one stale source comment describing the old internal-error block behavior; corrected it and reran release-quality verification.

### Completion Notes List

- Added `tests/hooks/hook-boundary.test.ts`, a child-process harness that runs shipped generated `.mjs` hook bundles, captures stdout/stderr/exit/signal/duration, isolates `HOME`, and uses `mkdtemp` workspaces/specs only.
- Locked malformed stdin fail-open behavior across Stop, TaskCompleted, PostToolBatch, PostCompact, and StopFailure without stdout diagnostic pollution.
- Locked Stop `/goal` boundary: in-progress execution exits 0 with no continuation prompt, `stop_hook_active` re-entry is a no-op, and `ALL_TASKS_COMPLETE` only emits deterministic verification-block gates.
- Locked TaskCompleted no-false-completion gates for missing verification block, failed verification block, stale execution taskIndex, malformed state, missing task_id, and helper exception fail-open.
- Preserved event-specific stdout contracts: Stop block JSON stays `decision:"block"`, TaskCompleted pass-through stays `{continue:true}`, PostToolBatch advisory stays `hookSpecificOutput`.
- Added `runId` and `goalId` to hook-readable `CurdxState` so TaskCompleted gate reasons can include run/goal identity.
- Did not change plugin manifest, dependency registry, skills, agents, release tags, external MCP behavior, browser probes, recovery retry, or release dry-run logic.

### File List

- `src/hooks/_shared/types.ts`
- `src/hooks/task-completed-verifier.ts`
- `tests/hooks/hook-boundary.test.ts`
- `plugins/curdx-flow/hooks/scripts/task-completed-verifier.mjs`
- `plugins/curdx-flow/hooks/scripts/task-completed-verifier.mjs.map`

### Change Log

- 2026-05-17: Added generated hook boundary tests covering fail-open, stdout/stderr cleanliness, gate block reasons, Stop `/goal` no-continuation behavior, PostToolBatch advisory JSON, and hook runtime duration capture.
- 2026-05-17: Enhanced TaskCompleted gate reasons with missing/failed/stale evidence details, next action or re-run command, spec/phase identity, and optional runId/goalId.
- 2026-05-17: Changed TaskCompleted non-deterministic helper/top-level exceptions from exit 2 block to fail-open diagnostics plus `{continue:true}`.
- 2026-05-17: Rebuilt generated hook bundle via `npm run build:hooks`; hook freshness, full verify, and Claude plugin validation pass.

### Review Findings

- 2026-05-17: Fixed one medium-risk finding during final audit: source comments still documented the old TaskCompleted internal-error block path after behavior changed to fail-open. Comment now matches runtime behavior.
- 2026-05-17: Final review outcome: pass. No open findings remain after `npm run verify` and `claude plugin validate ./plugins/curdx-flow`.

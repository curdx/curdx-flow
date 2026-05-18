# Story 2.6: QA Report-Only Evidence Surface

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为只想验收、不想让 AI 改代码的 QA 或评审者，
我希望 curdx-flow 提供清晰的 report-only 证据输出面，
以便我能看到复现步骤、严重等级、证据链接、影响范围和建议，而不会触发自动修复或源码变更。

## Acceptance Criteria

1. **Report-only 模式可见：** 给定用户以 report-only 模式运行 curdx-flow，当系统完成验证计划、能力路由和报告生成时，Markdown 和 JSON 输出必须明确标记 `mode: report-only`/`reportOnly: true`，并说明本次运行没有源码修改，只有 report/evidence/artifact/state artifact 写入。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.6`; `_bmad-output/planning-artifacts/prd.md#FR33`; `_bmad-output/planning-artifacts/prd.md#NFR5`]
2. **QA 问题卡片完整：** 给定 report-only 发现浏览器、API、数据、依赖、环境或外部能力问题，当报告生成时，每个问题必须包含复现步骤、严重等级、影响范围、`evidenceRefs`、artifact 链接和建议下一步；不得生成 fix attempt、源码 patch、自动提交或暗示已修复。[Source: `_bmad-output/planning-artifacts/prd.md#FR50`; `_bmad-output/planning-artifacts/architecture.md#IP-REPORT-003 Reviewer Readability`]
3. **Manual confirmation：** 给定某个问题需要人工判断，当系统无法自动确认通过或失败，报告必须标记 `manual-confirmation-required`/`needs-user-input`，并列出人工需要检查的证据、artifact、判断标准和负责人。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.6`; `_bmad-output/planning-artifacts/architecture.md#IP-REPORT-004 No User Guesswork`]
4. **能力降级解释：** 给定某项关键能力不可用导致验证降级，当 report-only 报告输出时，报告必须说明缺失能力、原本要验证什么、fallback 做了什么、可信度下降在哪里；如果关键证据缺失，最终 verdict 必须为 `blocked`、`partial` 或 `manual-confirmation-required`，不得输出 passed/complete。[Source: `_bmad-output/planning-artifacts/architecture.md#Degraded Mode Experience`; `_bmad-output/implementation-artifacts/2-5-capability-routing-remediation-planner.md#Completion Notes List`]
5. **Tech lead 合并判断面：** 给定 report-only 结果被技术负责人用于合并判断，当查看报告顶部和 JSON 输出时，报告必须一眼显示是否可交付、哪些问题阻塞、哪些只是警告、下一步负责人、是否可发布；JSON 输出必须能被后续 fix mode 或 ticket/story 生成流程消费。[Source: `_bmad-output/planning-artifacts/prd.md#FR47`; `_bmad-output/planning-artifacts/prd.md#FR48`; `_bmad-output/planning-artifacts/prd.md#FR51`; `_bmad-output/planning-artifacts/prd.md#FR52`; `_bmad-output/planning-artifacts/architecture.md#IP-REPORT-001 One-Glance Verdict`]
6. **验证覆盖：** 给定 Story 2.6 完成，当执行验证时，最小验证命令必须包含 `npm run typecheck`、report-only mode tests、report renderer tests；测试必须覆盖 report-only 不改源码、问题严重等级、manual confirmation、能力降级、JSON 可消费输出。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.6`]

## Tasks / Subtasks

- [x] 固定 Story 2.6 范围和复用边界（AC: 1-6）
  - [x] 完整读取 `src/runtime/reports/**`、`src/runtime/verdict/**`、`src/runtime/policy/**`、`src/runtime/planner/**`、`src/runtime/capabilities/**` 和现有 tests。
  - [x] 本 story 只增强 report-only QA 输出面、JSON sections、manual confirmation/merge readiness 表达；不执行真实修复、不新增 browser/API/data adapters、不新增 release gate。
  - [x] 保持 `renderVerificationReport()` 是展示面；completion 真相仍由 `evaluateCompletionVerdict()` 和 evidence/policy/routing facts 决定。

- [x] 扩展 report-only JSON/human report contract（AC: 1, 2, 5, 6）
  - [x] 扩展 `ReportSections` 或新增 report-only summary types，表达 `mode`、`noSourceChanges`、`qaIssues`、`blockingIssues`、`warnings`、`mergeReadiness`、`consumableNextSteps`。
  - [x] Markdown 顶部必须一眼显示：Complete、Can release、Report-only、Source changes、Blocking issues count、Warning issues count、Manual confirmation count、Next action owner。
  - [x] JSON 必须保留 machine-readable issue objects，至少包含 id、category、severity、summary、reproductionSteps、impact、evidenceRefs、artifactRefs、recommendation、owner、blocksCompletion。
  - [x] 不破坏 `plugins/curdx-flow/schemas/verification-report.schema.json` 和 `validateContract('verificationReport', json)`。

- [x] 加强 QA issue rendering 和 artifact links（AC: 2, 5）
  - [x] 当前 `ReportOnlyIssue` 已有 severity/reproduction/evidence/impact/recommendation；补齐 category、artifactRefs、owner、blocksCompletion、suggestedMode 或等价字段。
  - [x] 让 report-only issue 的 Markdown 输出包含 artifact refs，不只列 evidence refs。
  - [x] 严禁报告出现 `fixed`、`auto-fixed`、`modified source`、`patch generated` 等暗示修复已执行的 wording，除非非 report-only 且有 fix action log + same-path retry evidence。

- [x] Manual confirmation 输出面（AC: 3, 5）
  - [x] 扩展 manual confirmation section，使每个人工判断项包含 evidence/artifact、判断标准、owner、next action、risk level。
  - [x] 当 verdict 为 `manual-confirmation-required` 时，report status 必须映射为 `needs-user-input`，顶部和 transcript summary 都必须可见。
  - [x] 如果 manual confirmation 是因为 routing fallback 或 capability degraded，报告必须引用 capability route/remediation facts。

- [x] 能力降级与 route/remediation 汇总（AC: 4, 5）
  - [x] 复用 Story 2.5 的 `capabilityRoutes` 和 `remediationPlans` report sections，补齐 report-only 语言：缺什么、原本验证什么、fallback 做了什么、信任下降在哪里。
  - [x] 关键 browser/API/data/external capability 缺失时，最终 verdict 只能是 `blocked`、`partial` 或 `manual-confirmation-required`；report renderer 不得把 degraded route 包装成 passed。
  - [x] Report JSON 中的 degraded capability/route/remediation sections 必须可被后续 fix mode 或 ticket/story 生成流程读取。

- [x] 保持 report-only write/source safety（AC: 1, 2, 6）
  - [x] Report-only 下 `sourceChanges.modifiedSource` 必须始终 false，`files` 为空；如果 `state.generatedFiles` 出现 source/config/git/dependency 写入，应由 verdict/policy blocking 反映出来。
  - [x] `writeVerificationReport()` 仍只能写 `.curdx/reports/**`，保持 atomic write 和 workspace containment。
  - [x] Tests 使用 `mkdtemp`，不得在 repo 根写 `.curdx/**`、`specs/**`、`.claude/**`、`.mcp.json`。

- [x] 增加 focused tests（AC: 1-6）
  - [x] 扩展 `tests/runtime/reports/report-renderer.test.ts`：覆盖 report-only mode banner、no source changes、issue severity/category/artifactRefs、blocking vs warning counts、manual confirmation、degraded capability route、JSON 可消费 next steps。
  - [x] 扩展 `tests/runtime/verdict/verdict-evaluator.test.ts`：覆盖 report-only source mutation blocked、manual confirmation required、degraded route/fallback 不 complete。
  - [x] 如新增 report-only helper，新增 `tests/runtime/reports/report-only-surface.test.ts` 或等价 focused path。
  - [x] 保留 Story 2.4/2.5 回归：report-only 不改源码、policy effects/action logs、capabilityRoutes/remediationPlans 仍渲染。

- [x] 验证和记录（AC: 6）
  - [x] 运行 `npm run typecheck`、`npm run test:reports`、`npm run test:verdict`、必要的 focused report-only vitest path。
  - [x] 如 schema/contract 变更，运行 `npm run test:contracts`。
  - [x] 运行 `npm run verify`，确认 `test:planner`、`test:capabilities`、`test:policy` 等前序 gates 没有回归。
  - [x] 在 Dev Agent Record 记录实现摘要、验证命令、文件列表、review findings 和 deferred scope。

### Review Findings

- [x] [Review][Patch] Report-only issue text could pass through upstream wording such as `fixed`、`auto-fixed`、`modified source` or `patch generated`, violating AC2 wording constraints — fixed by neutralizing prohibited repair wording for report-only issue fields and adding regression coverage. [`src/runtime/reports/renderer.ts`; `tests/runtime/reports/report-renderer.test.ts`]
- [x] [Review][Patch] Manual confirmation items only used explicit `artifactRefs`; evidence-linked artifacts could be omitted when the verdict gap only supplied `evidenceIds` — fixed by deriving artifact refs from evidence summaries and testing the inferred trace artifact path. [`src/runtime/reports/renderer.ts`; `tests/runtime/reports/report-renderer.test.ts`]
- [x] [Review][Patch] Capability route Markdown labeled a selected primary capability as `Fallback`, which could mislead reviewers in selected-route reports — fixed by rendering `Fallback: none` unless the route decision is actually `fallback`. [`src/runtime/reports/renderer.ts`]

## Dev Notes

### 当前发现

- `renderVerificationReport()` 已能输出 Markdown/JSON、`reportOnly`、`sourceChanges`、evidence/artifact summaries、policy effects、action logs、capability routes 和 remediation plans；Story 2.6 应在此基础上增强 QA/merge-readiness 输出，不重写报告系统。[Source: `src/runtime/reports/renderer.ts`; `src/runtime/reports/types.ts`]
- `ReportOnlyIssue` 当前包含 `id`、`severity`、`summary`、`reproductionSteps`、`evidenceRefs`、`impact`、`recommendation`，但缺少 category、artifact refs、owner、blocksCompletion 等 QA/ticket 消费字段。[Source: `src/runtime/reports/types.ts`]
- `buildSourceChanges()` 已在 report-only 下强制 `modifiedSource: false`、`files: []`，并显示 “no source files were modified”；Story 2.6 需保留并测试该行为。[Source: `src/runtime/reports/renderer.ts`]
- `evaluateCompletionVerdict()` 已能把 report-only source mutation、policy blocked/skipped、capability routes degraded/blocker 转成 blocked/partial；Story 2.6 不应把报告层做成第二套 verdict evaluator。[Source: `src/runtime/verdict/evaluator.ts`]
- `writeVerificationReport()` 已通过 `resolveReportPaths()` 写入 `.curdx/reports/<run-id>.report.md/json`，并有 atomic rename failure coverage；Story 2.6 不应改变写入路径边界。[Source: `src/runtime/reports/store.ts`; `tests/runtime/reports/report-renderer.test.ts`]

### Previous Story Intelligence

- Story 2.4 的 review 修复要求 report-only allowed write roots 不可扩宽，raw destructive/release commands 必须 authorization-gated；2.6 的 QA report 不得用任何 “fix attempt” 表达绕过该策略。[Source: `_bmad-output/implementation-artifacts/2-4-report-only-fix-mode-risk-policy.md#Review Findings`]
- Story 2.5 的 review 修复要求 Playwright fast-skip 不产生 remediation 误报，UX evidence 默认路由到 `ui-ux-pro-max`；2.6 的 degraded capability/report-only surface 必须正确显示这些 route/remediation facts。[Source: `_bmad-output/implementation-artifacts/2-5-capability-routing-remediation-planner.md#Review Findings`]
- 2.5 已新增 `test:planner` 并纳入 `verify`；2.6 运行全量 verify 时必须确认前序 planner/capability/policy gates 不回退。[Source: `package.json`]

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | QA/Tech lead 只想看证据和阻塞，不想让 AI 改代码或听模型自述。 |
| Runtime Directory | `src/runtime/reports/**` owns report-only surface; `src/runtime/verdict/**` owns final truth; `src/runtime/policy/**` and `src/runtime/planner/**` provide facts. |
| Plugin Surface | No new slash command required unless implementation exposes a runtime/report CLI surface. |
| Schema / Contract | Keep `verification-report.schema.json` valid; add TS-only fields under `sections` unless a shipped schema boundary requires stricter validation. |
| Contract Test | Required only if schema/contract guard changes. |
| Runtime Test | `tests/runtime/reports/**` and `tests/runtime/verdict/**`. |
| Fixture | In-memory report inputs plus `mkdtemp` for report writes; no real repo `.curdx/**`. |
| Evidence Output | QA issues reference evidence ids and artifact refs; degraded capabilities/routes/remediation plans remain machine-readable. |
| Report Surface | Top summary, Report-Only Issues, Manual Confirmation, Capability Routes, Remediation Plans, Next Actions. |
| Failure Mode | report-only source mutation, missing browser/API/data evidence, degraded external capability, manual confirmation, blocked vs warning issue split. |
| Verification Commands | `npm run typecheck`, `npm run test:reports`, `npm run test:verdict`, focused report-only test path, `npm run verify`. |

### Architecture Guardrails

- Reports are display plane, not execution plane. They must not own completion truth, run tools, install dependencies, mutate source, or create fix attempts.[Source: `_bmad-output/planning-artifacts/architecture.md#Architecture Glossary`]
- Report top must answer: complete now, what was verified, missing evidence, degraded capabilities, next owner, release readiness.[Source: `_bmad-output/planning-artifacts/architecture.md#IP-REPORT-001 One-Glance Verdict`]
- Final reports must group by journey/acceptance criteria/command/artifact and distinguish passed, degraded and unverified; “全部完成” style summaries are forbidden.[Source: `_bmad-output/planning-artifacts/architecture.md#IP-REPORT-003 Reviewer Readability`]
- If users must guess ports, page health, API request, saved data or logs, the workflow is at most `partial`、`blocked` or `needs-user-input`.[Source: `_bmad-output/planning-artifacts/architecture.md#IP-REPORT-004 No User Guesswork`]
- Report-only mode forbids source/config/dependency/global state mutations; report/evidence/artifact writes must remain visibly distinct.[Source: `_bmad-output/planning-artifacts/prd.md#NFR5`; `_bmad-output/implementation-artifacts/2-4-report-only-fix-mode-risk-policy.md#Architecture Guardrails`]

### Latest Claude Code Information

- 官方 Claude Code 文档索引仍以 <https://code.claude.com/docs/llms.txt> 为事实入口。Story 2.6 不改 manifest、hooks、skills、agents、dependencies 或 release tags；如果实现触碰 plugin-facing surface，再重新运行官方 docs/CLI 校验和 `claude plugin validate ./plugins/curdx-flow`。

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/reports/types.ts`
- `src/runtime/reports/renderer.ts`
- `src/runtime/reports/summary.ts`
- `src/runtime/reports/store.ts`
- `src/runtime/reports/index.ts`
- `src/runtime/verdict/evaluator.ts`
- `src/runtime/verdict/types.ts`
- `src/runtime/policy/action-risk-policy.ts`
- `src/runtime/planner/capability-routing.ts`
- `src/runtime/capabilities/remediation.ts`
- `tests/runtime/reports/report-renderer.test.ts`
- `tests/runtime/verdict/verdict-evaluator.test.ts`
- `tests/runtime/policy/action-risk-policy.test.ts`
- `tests/runtime/planner/capability-routing.test.ts`

**NEW expected only if useful:**

- `src/runtime/reports/report-only-surface.ts`
- `tests/runtime/reports/report-only-surface.test.ts`

**Only if shipped schema or plugin-facing runtime surface changes:**

- `plugins/curdx-flow/schemas/verification-report.schema.json`
- `src/runtime/contracts/index.ts`
- `src/hooks/lib/runtime-cli.ts`
- `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs`
- `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs.map`

### Known Risks To Prevent

- Do not implement or trigger real fix mode actions in report-only mode.
- Do not show blocked/degraded report-only findings as passed or complete.
- Do not hide evidence gaps only in local artifacts; transcript/report summary must show missing evidence and next action.
- Do not remove redaction/truncation behavior or leak secrets, cookies, raw MCP responses, full logs, or production data.
- Do not hand-edit generated hook bundles.
- Do not add a new schema without updating contract guards/tests.
- Do not add `allowed-tools: "*"` or change plugin manifest/skills for this report surface story.

## Project Structure Notes

- Alignment: Story 2.6 completes Epic 2 by making mode/policy/routing/remediation facts usable for QA and review, before Epic 3/4 add project topology and real journey adapters.
- Existing good pattern: report renderer tests already build in-memory `StateLedger`, evidence, artifacts, verdicts, blockers and issue inputs. Extend those builders rather than adding real filesystem or external tool dependencies.
- Backcompat note: `VerificationReportJson.sections` is a record and tolerates added subsections; prefer additive fields over renaming existing report keys.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 2.6`
- `_bmad-output/planning-artifacts/epics.md#Story Requirement Trace`
- `_bmad-output/planning-artifacts/prd.md#FR33`
- `_bmad-output/planning-artifacts/prd.md#FR47-FR52`
- `_bmad-output/planning-artifacts/prd.md#NFR5`
- `_bmad-output/planning-artifacts/prd.md#NFR23`
- `_bmad-output/planning-artifacts/prd.md#NFR24`
- `_bmad-output/planning-artifacts/architecture.md#IP-REPORT-001 One-Glance Verdict`
- `_bmad-output/planning-artifacts/architecture.md#IP-REPORT-003 Reviewer Readability`
- `_bmad-output/planning-artifacts/architecture.md#IP-REPORT-004 No User Guesswork`
- `_bmad-output/implementation-artifacts/2-4-report-only-fix-mode-risk-policy.md`
- `_bmad-output/implementation-artifacts/2-5-capability-routing-remediation-planner.md`
- `src/runtime/reports/renderer.ts`
- `src/runtime/reports/types.ts`
- `src/runtime/verdict/evaluator.ts`
- `tests/runtime/reports/report-renderer.test.ts`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-05-17: RED `npx vitest run tests/runtime/reports/report-renderer.test.ts` failed 3 report-only surface assertions as expected; `npx vitest run tests/runtime/verdict/verdict-evaluator.test.ts` passed, confirming verdict layer already guarded degraded/manual states.
- 2026-05-17: GREEN `npx vitest run tests/runtime/reports/report-renderer.test.ts` passed after report surface implementation.
- 2026-05-17: Full verification passed with `npm run verify`.
- 2026-05-17: Code review found 3 patch findings; all were fixed and revalidated with `npx vitest run tests/runtime/reports/report-renderer.test.ts`, `npm run typecheck`, and `npm run verify`.

### Completion Notes List

- Added top-level report `mode`, report-only/no-source-change summary, blocking/warning/manual confirmation counts, and merge-readiness fields for tech lead review.
- Extended report-only QA issues with category, artifact refs, owner, blocksCompletion, suggestedMode, blocking/warning splits, and consumable next steps for future fix/ticket flows.
- Converted manual confirmation output into structured JSON/Markdown with criteria, evidence/artifact refs, owner, next action, risk level, capability route refs, and remediation refs.
- Expanded capability route/remediation rendering with primary vs fallback capability, degraded reason, trust impact, evidence impact, remediation refs, and completion impact without executing any fix action.
- Preserved report-only write/source safety: renderer still reports `sourceChanges.modifiedSource: false` and verdict/policy remains the completion truth.
- Code review follow-up complete：修复 report-only 禁用修复措辞透传、manual confirmation artifact refs 推导、selected route fallback 标签误导，并补回归测试。
- Deferred scope: no new browser/API/data adapters, no release gate, no plugin manifest/hooks/skills changes.

### File List

- `_bmad-output/implementation-artifacts/2-6-qa-report-only-evidence-surface.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/runtime/reports/types.ts`
- `src/runtime/reports/renderer.ts`
- `src/runtime/reports/summary.ts`
- `src/runtime/reports/index.ts`
- `tests/runtime/reports/report-renderer.test.ts`
- `tests/runtime/verdict/verdict-evaluator.test.ts`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Implemented QA report-only evidence surface and marked story ready for review.
- 2026-05-17: Addressed code review findings (3 patch items) and moved story status to done.

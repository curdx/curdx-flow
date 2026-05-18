# Story 2.4: Report-Only、Fix Mode 与动作风险策略

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为 QA、开发者或团队负责人，
我希望 curdx-flow 明确区分只报告、不改代码的 report-only 模式，以及允许诊断、修改、重跑的 fix mode，
以便系统在激进自动化的同时不会误改源码、误跑高风险动作或绕过授权。

## Acceptance Criteria

1. **Report-only 写入边界：** 给定用户选择 report-only 模式，当 curdx-flow 执行验证、浏览器检查、API 检查、日志读取或报告生成时，系统不得修改源码、项目配置、依赖、数据库 schema、全局 Claude/MCP 配置或 git 状态；只允许写入明确区分的 `.curdx/reports/**`、`.curdx/evidence/**`、`.curdx/artifacts/**` 和必要的 `.curdx/state/**` 运行账本，且这些写入必须被标记为 report/evidence/state artifact，不得伪装成 source change。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.4`; `_bmad-output/planning-artifacts/architecture.md#IP-MODE-001`]
2. **Report-only 问题报告：** 给定 report-only 模式发现问题，当报告生成时，报告必须包含复现步骤、严重等级、证据链接、影响范围和建议；不得声称问题已修复、auto-fixed 或 modified source。[Source: `_bmad-output/planning-artifacts/prd.md#FR33`; `_bmad-output/planning-artifacts/prd.md#FR50`; `tests/runtime/reports/report-renderer.test.ts`]
3. **Fix mode 动作日志：** 给定用户选择 fix mode，当系统准备修改源码、生成验证文件、安装普通 dev 依赖或重跑验证时，系统必须记录 action type、目标文件范围、风险等级、变更意图、执行结果、diff/command 摘要和 `evidenceRefs`；修复后必须要求 same-path retry 或明确 blocker，不得把“准备修复”当作“已修复”。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.4`; `_bmad-output/planning-artifacts/architecture.md#IP-RETRY-001`]
4. **高风险动作授权：** 给定某个动作被 action-risk policy 判定为 high/critical 或 destructive，当该动作涉及删除文件、destructive migration、全局配置变更、push、tag、npm publish、Claude plugin release、访问生产数据或不可逆命令时，系统必须要求明确授权或 release-stage 上下文；未授权时返回 blocker，不得自动执行。[Source: `_bmad-output/planning-artifacts/prd.md#NFR13`; `_bmad-output/planning-artifacts/architecture.md#IP-REL-001`; Claude Code hooks security docs: <https://code.claude.com/docs/en/hooks.md#security-considerations>]
5. **No false completion 不可关闭：** 给定用户或配置试图关闭 no false completion，当 policy 被解析或执行时，系统必须拒绝并输出 blocked policy decision；报告必须说明只能通过 blocker/manual confirmation 表达缺证据，不允许静默通过。[Source: `_bmad-output/planning-artifacts/prd.md#NFR1`; `plugins/curdx-flow/schemas/action-risk-policy.schema.json`]
6. **策略影响 planner/report/verdict：** 给定 policy 被 runtime planner、adapter、verdict 或 report 读取，当模式或风险等级影响执行路径时，planner/report 必须显示策略如何影响动作选择和 evidence 要求；被 policy 跳过、阻止或降级的动作必须导致 `partial`、`blocked` 或 `manual-confirmation-required`，不得被当作已验证。[Source: `_bmad-output/planning-artifacts/architecture.md#FR33-FR40 Modes and Risk Policy`; `_bmad-output/planning-artifacts/architecture.md#IP-CAPABILITY-001`]
7. **验证覆盖：** 给定 Story 2.4 完成，当执行验证时，最小验证命令必须包含 `npm run typecheck`、action-risk policy contract tests、mode policy runtime tests；测试必须覆盖 report-only 不改源码、fix mode action log、高风险授权缺失、no false completion 不可关闭、策略跳过导致 partial/blocked。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.4`]

## Tasks / Subtasks

- [x] 固定 Story 2.4 范围和复用边界（AC: 1-7）
  - [x] 完整读取 `src/runtime/contracts/index.ts`、`plugins/curdx-flow/schemas/action-risk-policy.schema.json`、`src/runtime/verdict/evaluator.ts`、`src/runtime/reports/renderer.ts`、`src/runtime/state/types.ts`、现有 contract/report/verdict tests。
  - [x] 本 story 实现 mode/risk policy contract、report-only write guard、fix mode action log contract、policy-to-verdict/report projection；不实现 Story 2.5 remediation planner、不执行真实安装/修复、不实现 Story 2.6 完整 QA report surface、不实现 release publish/tag。
  - [x] 保持 runtime source-first；如触碰 `src/hooks/lib/runtime-cli.ts` 或 plugin-facing runtime bundle，必须通过 `npm run build:hooks` 更新 generated hooks，不得手改 `plugins/curdx-flow/hooks/scripts/**`。

- [x] 扩展 action-risk policy schema 和 TypeScript contract（AC: 3, 4, 5, 7）
  - [x] 将 `ActionRiskPolicy` 从最小占位 schema 扩展为可验证结构：`mode`、`defaultRiskLevel`、`noFalseCompletion: true`、`rules[]`、可选授权上下文、可选允许写入根目录。
  - [x] `rules[]` item 至少表达 `id`、`actionType/actionPattern`、`riskLevel`、`mutatesWorkspace`、`destructive`、`requiresAuthorization`、`allowedModes`、`requiresReleaseStage` 或等价字段。
  - [x] 更新 `src/runtime/contracts/index.ts` guard，使 schema 与 runtime guard 都拒绝 `noFalseCompletion: false`、非法 mode/risk/action rule 形状，并保留 unknown future fields。
  - [x] 更新 `tests/fixtures/contracts/valid/contracts.json`、`unknown-fields.json`、`invalid/*.json` 中的 `actionRiskPolicy` fixtures。

- [x] 新增 runtime policy helper（AC: 1, 3, 4, 5, 6）
  - [x] 新建 `src/runtime/policy/action-risk-policy.ts`、`src/runtime/policy/types.ts`、`src/runtime/policy/index.ts` 或等价模块；保持纯函数、无文件写入、无 shell/model/MCP 调用。
  - [x] 提供 `buildDefaultActionRiskPolicy()`、`evaluateActionPolicy()`、`classifyActionRisk()`、`validateModeWriteBoundary()` 或等价 API。
  - [x] Report-only 模式：允许 `.curdx/reports/**`、`.curdx/evidence/**`、`.curdx/artifacts/**`、必要 `.curdx/state/**`；阻止 `src/**`、`plugins/**`、`package.json`、lockfile、`.claude/**`、`.mcp.json`、git 操作、数据库 migration、全局 Claude/MCP 配置和任何 dependency install。
  - [x] Fix mode：允许低/中风险源码修改和 verifier rerun，但每个 mutating action 必须产出 action log；high/critical/destructive/release actions 在缺少授权时返回 blocker。
  - [x] Release mode：仅判定授权/证据，不执行真实 push/tag/npm publish/plugin release；真实 release two-key 的完整实现留给 release epic，但本 story 必须把 release actions 标为 high/critical 且默认 blocked。

- [x] 定义 fix mode action log 结构（AC: 3, 6）
  - [x] Action log entry 至少包含 `id`、`runId/goalId`（可选输入）、`mode`、`actionType`、`targetFiles`、`riskLevel`、`intent`、`result`、`command` 或 `diffSummary`、`evidenceRefs`、`requiresSamePathRetry`、`createdAt`。
  - [x] Action log 不得包含 raw secrets、完整 MCP payload、完整 logs 或未脱敏 request/response；只记录摘要和 artifact/evidence refs。
  - [x] 若 action 未执行（policy blocked/report-only skipped），日志必须标记 `result: "blocked" | "skipped"` 或等价状态，不能标记 success。
  - [x] 将 action log 作为 runtime JSON fact 提供给 planner/report/verdict 消费；如果选择落入 state ledger，只能放在 `policy` 或 future-compatible field，不能破坏 existing `StateLedger` schema。

- [x] 接入 completion verdict 和 report projection（AC: 2, 5, 6）
  - [x] `evaluateCompletionVerdict()` 在 `state.policy.noFalseCompletion !== true` 或 policy helper 返回不可关闭违规时必须输出 `blocked`，并说明 no false completion 不可关闭。
  - [x] 被 report-only 跳过的 core mutating/verifier action 必须进入 missingEvidence/blocker，导致 `blocked`；非核心或可人工确认的 skipped action 才能进入 `partial` 或 `manual-confirmation-required`。
  - [x] `renderVerificationReport()` 必须能显示 report-only policy effect：`mode: report-only`、source changes false、issue severity、reproduction steps、evidence links、impact、recommendation、policy blockers。
  - [x] Report markdown/JSON 不得出现 `fixed`、`auto-fixed`、`modified source` 等会暗示源码已修复的 wording，除非 fix mode action log 明确记录了已执行源码修改且 same-path retry evidence 通过。

- [x] 保持 dirty worktree 和 generated file safety（AC: 1, 3, 4）
  - [x] 复用 `StateLedger.dirtyBaseline` 和 `generatedFiles` 分类；report-only 下出现 `source-change` 或 `generated-verification-file` 以外的可疑源码路径时必须 blocked。
  - [x] 不得 revert、覆盖或格式化 unrelated dirty files；policy helper 只判定，不执行 revert/cleanup。
  - [x] Tests 必须使用 `mkdtemp` workspace，不在仓库根写真实 `.curdx/**`、`specs/**`、`.claude/**` 或 `.mcp.json`。

- [x] 增加 focused tests（AC: 1-7）
  - [x] 新增 `tests/runtime/policy/action-risk-policy.test.ts` 或等价：覆盖 report-only allowed/blocked write paths、fix mode action log、高风险授权缺失、release action blocked、no false completion false blocked、unknown future fields tolerated。
  - [x] 扩展 `tests/contracts/runtime-contracts.test.ts` 和 fixtures：覆盖 action-risk policy schema/guard 的 valid、bad enum、missing required、unsupported version、schema-only rule violations。
  - [x] 扩展 `tests/runtime/reports/report-renderer.test.ts`：覆盖 report-only issue severity/reproduction/evidence links 和不暗示修复。
  - [x] 扩展 `tests/runtime/verdict/verdict-evaluator.test.ts`：覆盖 policy skip/block 导致 `blocked` 或 `partial`，以及 no false completion 不可关闭。
  - [x] 如引入 runtime CLI policy surface，增加 generated runtime CLI test 并运行 `npm run build:hooks`、`npm run check:hooks-fresh`。

- [x] 验证和记录（AC: 7）
  - [x] 运行 `npm run typecheck`、`npm run test:contracts`、`npm run test:verdict`、`npm run test:reports`、`npm run test:policy`（如新增 script，否则运行对应 vitest path）。
  - [x] 如果 touched `src/hooks/**` 或 plugin-facing runtime bundle，运行 `npm run build:hooks`、`npm run check:hooks-fresh`、相关 `npm run test:hooks`。
  - [x] 如果 touched plugin skill/manifest/runtime surface，运行 `claude plugin validate ./plugins/curdx-flow` 和必要的 `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`。
  - [x] 在 Dev Agent Record 记录实现摘要、验证命令、文件列表、review findings 和明确 deferred scope。

### Review Findings

- [x] [Review][Patch] Report-only `allowedWriteRoots` could widen writes outside `.curdx/**` — fixed by constraining schema/guard/runtime root filtering to `.curdx/reports`, `.curdx/evidence`, `.curdx/artifacts`, and `.curdx/state`. [`src/runtime/policy/action-risk-policy.ts:204`]
- [x] [Review][Patch] Raw irreversible commands were not risk-classified as high/critical — fixed by classifying destructive/release command patterns such as `rm -rf`, `git push`, `git tag`, `npm publish`, and `claude plugin tag/release`. [`src/runtime/policy/action-risk-policy.ts:470`]
- [x] [Review][Patch] Full verify did not run the focused policy runtime tests — fixed by adding `npm run test:policy` to `npm run verify`. [`package.json:34`]

## Dev Notes

### 当前发现

- `plugins/curdx-flow/schemas/action-risk-policy.schema.json` 已存在，但当前只约束 `schemaVersion`、`policyId`、`mode`、`defaultRiskLevel`、`rules` 和 `noFalseCompletion: true`；Story 2.4 的直接工作是把这个占位 contract 扩展为实际 rule/action 决策合同。[Source: `plugins/curdx-flow/schemas/action-risk-policy.schema.json`]
- `src/runtime/contracts/index.ts` 已把 `actionRiskPolicy` 纳入 `ContractName`、`CONTRACTS`、`ActionRiskPolicy` interface 和 runtime guard；实现应扩展这套 guard，不另建第二套 schema validator。[Source: `src/runtime/contracts/index.ts`]
- `StateLedger.mode` 已支持 `report-only | fix | release | verification`，`StateLedger.policy` 是对象，`generatedFiles` 已能记录 `source-change`、`generated-verification-file`、`report`、`evidence` 等分类；Story 2.4 应复用这些字段表达 mode/policy/action log，不破坏既有 state tests。[Source: `src/runtime/contracts/index.ts`; `src/runtime/state/types.ts`]
- `renderVerificationReport()` 已有 report-only 基础行为：当 `state.mode` 为 `report-only` 时，报告标记 `reportOnly: true`、`sourceChanges.modifiedSource: false`，并避免“fixed/auto-fixed”暗示；Story 2.4 应在此基础上增加 issue severity/reproduction/evidence links/policy effect，不要重写报告系统。[Source: `tests/runtime/reports/report-renderer.test.ts`]
- `evaluateCompletionVerdict()` 已实现 missing evidence、manual confirmation、partial、release authorization 和 stale/target mismatch evidence；Story 2.4 应把 policy blocker/skipped action 接入 verdict，不绕开现有 no-false-completion 判定。[Source: `src/runtime/verdict/evaluator.ts`; `tests/runtime/verdict/verdict-evaluator.test.ts`]
- `resolveReportPaths()`、`resolveEvidencePaths()` 和 `resolveStatePaths()` 已把 `.curdx/reports/**`、`.curdx/evidence/**`、`.curdx/artifacts/**`、`.curdx/state/**` 限定在 workspace 内；report-only write guard 应复用相同的 workspace-relative path 安全规则。[Source: `src/runtime/reports/store.ts`; `src/runtime/evidence/paths.ts`; `src/runtime/state/paths.ts`]

### Previous Story Intelligence

- Story 2.1 建立 capability matrix 和 guard 的教训：configured 或 skipped 不能被渲染成 ready。本 story 同理，policy-skipped 或 report-only-skipped 不能被当作 verified/passed。[Source: `_bmad-output/implementation-artifacts/2-1-capability-model-doctor-matrix.md#Review Findings`]
- Story 2.2 修复 plugin/external MCP readiness 的教训：不要用 shell fallback 或隐式安装来绕过 capability/policy。Story 2.4 的 fix mode 不得自动安装全局/插件/MCP 依赖；普通 dev dependency install 也必须走 policy decision 和 action log。[Source: `_bmad-output/implementation-artifacts/2-2-plugin-dependencies-external-mcp-readiness.md#Review Findings`]
- Story 2.3 修复 `allowManagedHooksOnly` 的教训：策略字段的 scope/来源必须精确，不能因为字段名相同就误判。Story 2.4 的 high-risk/destructive 判定必须保留 action source、mode、authorization context 和 target scope。[Source: `_bmad-output/implementation-artifacts/2-3-native-goal-detection-manual-fallback.md#Review Findings`]
- Story 1.3/1.5 建立 state/report 边界：写入必须原子、路径必须 workspace-contained、报告必须脱敏且保持结构化 contract shape。本 story 不得为了 report-only 简化而绕过这些 helper。[Source: `_bmad-output/implementation-artifacts/1-3-run-state-recovery-context-workspace-boundary.md`; `_bmad-output/implementation-artifacts/1-5-human-machine-readable-evidence-reports.md`]

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | QA 想只看报告不被改代码；开发者想进入 fix mode 但知道每个动作风险和证据；团队负责人想阻断未授权高风险动作。 |
| Runtime Directory | `src/runtime/policy/**` owns mode/risk decisions; `src/runtime/verdict/**` consumes blockers/skipped actions; `src/runtime/reports/**` renders policy effects. |
| Plugin Surface | Indirect: `curdx-flow` runtime/report outputs and future `/curdx-flow:*` skills consume policy facts. No new slash command required unless implementation chooses a runtime CLI policy command. |
| Schema / Contract | `plugins/curdx-flow/schemas/action-risk-policy.schema.json`; `ActionRiskPolicy` and policy decision/action log TypeScript contracts. |
| Contract Test | `tests/contracts/runtime-contracts.test.ts` fixtures for valid/invalid `actionRiskPolicy`. |
| Runtime Test | `tests/runtime/policy/action-risk-policy.test.ts` or equivalent focused vitest path. |
| Adapter Test | Not required unless an adapter is modified; policy helper should accept action facts without invoking adapters. |
| Fixture | Contract fixtures plus `mkdtemp` workspaces for report-only write path checks. |
| Evidence Output | Fix mode action log references evidence ids; report-only issue records include evidence links/artifact refs. |
| Report Surface | Markdown/JSON report shows `mode`, report-only no-source-change, issue severity/reproduction/impact/recommendation, policy blockers/skipped actions. |
| Failure Mode | report-only tries source write, high-risk action lacks authorization, `noFalseCompletion: false`, policy-skipped core evidence. |
| Verification Commands | `npm run typecheck`, `npm run test:contracts`, `npm run test:verdict`, `npm run test:reports`, focused policy tests, plus hook/plugin smoke only if runtime plugin surface changes. |

### Architecture Guardrails

- `src/runtime/policy/` owns action-risk policy and mode gates; it must not write evidence files, execute commands, call MCP/tools, modify git, install dependencies, or publish release artifacts.[Source: `_bmad-output/planning-artifacts/architecture.md#Component Boundaries`; `_bmad-output/planning-artifacts/architecture.md#FR33-FR40 Modes and Risk Policy`]
- Report-only mode forbids source/config/dependency/global state mutations; generated reports/evidence/artifacts must be visibly distinct from source changes.[Source: `_bmad-output/planning-artifacts/prd.md#NFR5`; `_bmad-output/planning-artifacts/architecture.md#IP-MODE-001`]
- Fix mode may modify source only through an explicit policy decision and action log. The action log is evidence metadata, not proof of success; same-path retry evidence is still required.[Source: `_bmad-output/planning-artifacts/architecture.md#IP-RETRY-001`]
- High-risk actions include destructive migration, global config change, push, tag, npm publish, Claude plugin release and irreversible commands; missing authorization must be a blocker.[Source: `_bmad-output/planning-artifacts/prd.md#NFR13`; `_bmad-output/planning-artifacts/architecture.md#IP-REL-001`]
- No false completion is a non-negotiable invariant. A policy file may not turn it off; a user may only supply manual confirmation where evidence requirements explicitly allow it.[Source: `_bmad-output/planning-artifacts/prd.md#NFR1`; `_bmad-output/planning-artifacts/architecture.md#Step 4 Completion Verdict Model`]
- Hooks and runtime policy must remain gate/control-plane logic. Do not move planner, action execution, fix application, or final verdict ownership into hooks.[Source: `_bmad-output/project-context.md#Hook Runtime Contracts`; `_bmad-output/planning-artifacts/architecture.md#IP-HOOK-001 Gate Only`]
- Claude Code command hooks execute with the user's full permissions; any plugin/runtime path that could trigger shell commands must treat policy as a protection boundary, not a cosmetic report field.[Source: Claude Code hooks security docs: <https://code.claude.com/docs/en/hooks.md#security-considerations>]

### Latest Claude Code Information

- Official Claude Code hooks docs state command hooks run with the system user's permissions and require careful validation/sanitization. Story 2.4 should treat hook/plugin-driven command execution as high-risk unless policy authorizes it. Source: <https://code.claude.com/docs/en/hooks.md#security-considerations>.
- Official `/goal` docs say evaluator-visible proof must appear in the conversation and that `/goal` does not run tools itself. Policy blockers/skipped actions must therefore be reflected in report/transcript summaries, not hidden only in local artifacts. Source: <https://code.claude.com/docs/en/goal.md>.
- No current Claude Code docs require changing plugin manifest or skill frontmatter for this story. If implementation changes shipped skills or plugin-facing runtime output, rerun `claude plugin validate ./plugins/curdx-flow`.

### Files To Read Before Editing

**UPDATE candidates:**

- `plugins/curdx-flow/schemas/action-risk-policy.schema.json`
- `src/runtime/contracts/index.ts`
- `src/runtime/verdict/evaluator.ts`
- `src/runtime/verdict/types.ts`
- `src/runtime/reports/renderer.ts`
- `src/runtime/reports/types.ts`
- `src/runtime/reports/summary.ts`
- `src/runtime/state/types.ts`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/runtime/verdict/verdict-evaluator.test.ts`
- `tests/runtime/reports/report-renderer.test.ts`
- `tests/fixtures/contracts/valid/contracts.json`
- `tests/fixtures/contracts/valid/unknown-fields.json`
- `tests/fixtures/contracts/invalid/*.json`

**NEW expected:**

- `src/runtime/policy/action-risk-policy.ts`
- `src/runtime/policy/types.ts`
- `src/runtime/policy/index.ts`
- `tests/runtime/policy/action-risk-policy.test.ts`

**Only if plugin-facing runtime CLI is changed:**

- `src/hooks/lib/runtime-cli.ts`
- `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs`
- `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs.map`

### Known Risks To Prevent

- Do not implement an automatic fixer/remediation planner in this story; Story 2.5/5.x own remediation and recovery execution.
- Do not let report-only write `src/**`, `plugins/**`, `package.json`, lockfiles, `.claude/**`, `.mcp.json`, git refs, database migrations, or global Claude/MCP config.
- Do not treat action log presence as proof that a fix worked; same-path retry or blocker remains required.
- Do not use policy to bypass missing evidence, stale evidence, target mismatch, or manual confirmation rules.
- Do not perform install/update/publish/tag/push as part of tests. Model those actions as blocked policy decisions with fixtures.
- Do not add a new dependency for policy validation; existing TypeScript guards, JSON Schema and Vitest are enough.
- Do not break report JSON contract consumed by `/goal` transcript summary and report tests.
- Do not write tests that depend on real user `~/.claude`, real git remote, real npm publish, real MCP servers, or network.
- Do not hand-edit generated hook bundles. Regenerate only if source changes require it.

## Project Structure Notes

- Alignment: Story 2.4 is the bridge between capability readiness (2.1-2.3) and remediation routing (2.5). It must output policy facts that later planners can consume without changing the fundamental evidence/verdict truth model.
- Existing good pattern: `src/runtime/capabilities/**` from Stories 2.1-2.3 keeps pure helpers fixture-friendly and lets `runtime-cli.ts` only integrate results. Follow the same shape for `src/runtime/policy/**`.
- Backcompat note: `ActionRiskPolicy` already exists as a shipped schema and guard. Extend it compatibly with `additionalProperties: true`; avoid breaking unknown future fields.
- Testing note: Keep report-only safety tests isolated. Use injected IO or `mkdtemp`, never the repo root, and assert source-change paths are blocked before any write happens.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 2.4`
- `_bmad-output/planning-artifacts/epics.md#Story Requirement Trace`
- `_bmad-output/planning-artifacts/prd.md#FR33`
- `_bmad-output/planning-artifacts/prd.md#FR34`
- `_bmad-output/planning-artifacts/prd.md#FR35-FR40`
- `_bmad-output/planning-artifacts/prd.md#NFR5`
- `_bmad-output/planning-artifacts/prd.md#NFR13`
- `_bmad-output/planning-artifacts/architecture.md#FR33-FR40 Modes and Risk Policy`
- `_bmad-output/planning-artifacts/architecture.md#IP-MODE-001 Report-Only and Fix Mode`
- `_bmad-output/planning-artifacts/architecture.md#IP-RETRY-001 Same-Path Retry`
- `_bmad-output/planning-artifacts/architecture.md#IP-REL-001 Release Two-Key Enforcement`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/2-1-capability-model-doctor-matrix.md`
- `_bmad-output/implementation-artifacts/2-2-plugin-dependencies-external-mcp-readiness.md`
- `_bmad-output/implementation-artifacts/2-3-native-goal-detection-manual-fallback.md`
- `plugins/curdx-flow/schemas/action-risk-policy.schema.json`
- `src/runtime/contracts/index.ts`
- `src/runtime/verdict/evaluator.ts`
- `src/runtime/reports/renderer.ts`
- `src/runtime/state/types.ts`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/runtime/reports/report-renderer.test.ts`
- `tests/runtime/verdict/verdict-evaluator.test.ts`
- Claude Code hooks security docs: <https://code.claude.com/docs/en/hooks.md#security-considerations>
- Claude Code `/goal` docs: <https://code.claude.com/docs/en/goal.md>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-05-17: 红灯测试先行：`npx vitest run tests/runtime/policy tests/contracts tests/runtime/verdict tests/runtime/reports` 失败于缺少 policy module、schema/guard 未验证 nested rule、verdict/report 未消费 policy facts。
- 2026-05-17: 实现后 focused tests 转绿：`npx vitest run tests/runtime/policy tests/contracts tests/runtime/verdict tests/runtime/reports`。
- 2026-05-17: 验证通过：`npm run typecheck`、`npm run test:contracts`、`npm run test:verdict`、`npm run test:reports`、`npm run test:policy`。
- 2026-05-17: 回归通过：`npm run verify`。
- 2026-05-17: Claude Code 插件验证通过：`claude plugin validate ./plugins/curdx-flow`、`CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`。
- 2026-05-17: Code review found 3 patch findings; all were fixed and revalidated with `npm run verify`, `claude plugin validate ./plugins/curdx-flow`, and `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`.

### Completion Notes List

- 实现 `src/runtime/policy/**` 纯函数 policy 层：默认 action-risk policy、风险分类、report-only 写入边界、授权/release-stage gating、fix mode action log 与脱敏摘要。
- 扩展 `action-risk-policy` JSON schema 和 runtime guard，验证 rule shape、授权上下文、allowed write roots，并继续保留 unknown future fields。
- 将 policy facts 接入 completion verdict：`noFalseCompletion !== true` 直接 blocked；policy blocked/skipped core action 不能 complete；optional skipped action 进入 partial。
- 将 policy facts 接入 verification report：report-only issue severity/reproduction/evidence/impact/recommendation、policy effects、fix mode action logs 和 same-path retry 要求会进入 Markdown/JSON。
- Deferred scope：未实现 remediation planner、真实修复执行、dependency install、push/tag/npm publish/plugin release；这些仍由后续 Story 2.5、Epic 5 和 Epic 6 承接。
- Code review follow-up complete：收窄 report-only allowed roots、补 raw command 高风险分类、把 `test:policy` 纳入 full verify gate。

### File List

- `package.json`
- `plugins/curdx-flow/schemas/action-risk-policy.schema.json`
- `src/runtime/contracts/index.ts`
- `src/runtime/policy/action-risk-policy.ts`
- `src/runtime/policy/index.ts`
- `src/runtime/policy/types.ts`
- `src/runtime/reports/index.ts`
- `src/runtime/reports/renderer.ts`
- `src/runtime/reports/types.ts`
- `src/runtime/verdict/evaluator.ts`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/fixtures/contracts/valid/contracts.json`
- `tests/fixtures/contracts/valid/unknown-fields.json`
- `tests/fixtures/contracts/invalid/schema-only-rules.json`
- `tests/runtime/policy/action-risk-policy.test.ts`
- `tests/runtime/reports/report-renderer.test.ts`
- `tests/runtime/verdict/verdict-evaluator.test.ts`

### Change Log

- 2026-05-17: Implemented report-only/fix/release action-risk policy contracts, runtime policy helper, verdict/report projections, and focused test coverage. Status moved to review.
- 2026-05-17: Addressed code review findings (3 patch items) and moved story status to done.

# Story 6.1: Release Evidence Model and Dry-Run Verdict

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为 curdx-flow 维护者，
我希望发布前先执行 release dry-run，并输出 release-ready 或 not-releasable verdict，
以便真实 push、tag、npm publish 或 plugin release 前有完整证据，而 dry-run 本身不会产生发布副作用。

## Acceptance Criteria

1. **Release verdict contract：** 给定维护者运行 release gate dry-run，当 release checks 执行，系统必须输出 release verdict，状态为 `release-ready` 或 `not-releasable`；verdict 必须包含 version、npmTag、claudePluginTag、check results、missingEvidence、blockers、nextAction 和 riskLevel。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.1`; `_bmad-output/planning-artifacts/prd.md#FR53`; `_bmad-output/planning-artifacts/prd.md#FR58`; `_bmad-output/planning-artifacts/prd.md#FR59`; `_bmad-output/planning-artifacts/prd.md#FR76`]
2. **Dry-run no side effects：** 给定 dry-run 执行，当检查过程需要验证发布前置条件，系统可以运行只读或本地验证命令；不得执行真实 push、tag、npm publish、`claude plugin tag --push` 或 plugin release。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.1`; `_bmad-output/planning-artifacts/prd.md#FR76`; `_bmad-output/planning-artifacts/prd.md#FR77`; `_bmad-output/planning-artifacts/prd.md#NFR13`; `_bmad-output/planning-artifacts/prd.md#NFR28`]
3. **Release evidence freshness：** 给定 release evidence 被写入 ledger，当 report 生成，release evidence 必须标记 L4 trust level 或 release-specific trust level；freshness 必须包含 commit/tag/version context，防止旧证据支撑新发布。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.1`; `_bmad-output/planning-artifacts/prd.md#NFR21`; `_bmad-output/planning-artifacts/prd.md#NFR25`; `_bmad-output/planning-artifacts/architecture.md#IP-REL-002`]
4. **Failure blocker：** 给定任一 release 前置条件失败，当 verdict 生成，状态必须为 `not-releasable`；blocker 必须说明失败检查、修复路径和是否需要重新运行 dry-run。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.1`; `_bmad-output/planning-artifacts/prd.md#FR59`; `_bmad-output/planning-artifacts/prd.md#NFR24`]
5. **One-glance report summary：** 给定 dry-run 结果被用户查看，当报告顶部渲染，必须一眼显示“未发布 / 可发布 / 不可发布”；不得让用户误以为 dry-run 已经发布。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.1`; `_bmad-output/planning-artifacts/architecture.md#IP-REPORT-001`]
6. **验证覆盖：** 给定 Story 6.1 完成，当执行验证，最小验证命令必须包含 `npm run typecheck` 和 release verdict/dry-run tests；测试必须覆盖 ready、not-releasable、no side effects、stale release evidence、missing check blocker 和 report summary。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.1`]

## Tasks / Subtasks

- [x] 定义 release evidence 和 dry-run verdict contract（AC: 1,3,6）
  - [x] 新增 `src/runtime/release/types.ts`，定义 release check、release evidence、freshness context、blocker、nextAction、dry-run verdict 类型。
  - [x] 新增 `src/runtime/release/dry-run.ts` 或等价函数，导出 `evaluateReleaseDryRun()`。
  - [x] 输出必须包含 version、npmTag、claudePluginTag、checks、missingEvidence、blockers、nextAction、riskLevel、trustLevel、freshness 和 sideEffects。
  - [x] `plugins/curdx-flow/schemas/release-verdict.schema.json` 必须与新增 TypeScript contract 保持一致，禁止 schema 允许的 verdict 与 runtime 不一致。

- [x] 实现 release-ready / not-releasable 判定（AC: 1,4）
  - [x] 所有 required checks 通过且 release evidence 对当前 commit/version/tag 新鲜时，输出 `release-ready`。
  - [x] 任一 required check failed、missing、stale、version/tag context mismatch 时，输出 `not-releasable`。
  - [x] blockers 必须包含 checkId、reason、remediation、requiresDryRunRerun 和 riskLevel。
  - [x] nextAction 必须能转化为具体修复或重新 dry-run 操作，不能只是“检查日志”。

- [x] 强化 dry-run 副作用边界（AC: 2,6）
  - [x] dry-run policy 必须显式禁止 `git push`、真实 `git tag`、`npm publish`、`claude plugin tag --push`、plugin release 等真实发布动作。
  - [x] 允许 `claude plugin tag --dry-run`、`claude plugin validate ./plugins/curdx-flow`、`npm run check-versions`、`npm run check:hooks-fresh` 等只读/本地验证命令作为 evidence source。
  - [x] verdict 必须记录 `published: false` 或等价状态，并区分 `not-published`、`release-ready`、`not-releasable` 用户可见 summary。
  - [x] 测试必须证明 dry-run 不会调用任何真实发布 executor。

- [x] 实现 release evidence freshness（AC: 3）
  - [x] freshness context 至少包含 currentCommit、version、npmTag、claudePluginTag、generatedAt 和 evidenceRefs。
  - [x] stale evidence、commit mismatch、version mismatch、tag mismatch 不得支撑 `release-ready`。
  - [x] release evidence trust level 使用 `L4` 或 `release`，并保留 machine-readable 字段。

- [x] 实现 one-glance release summary（AC: 5）
  - [x] 新增 `src/runtime/release/summary.ts` 或等价 renderer，输出顶部状态、版本、tags、通过/失败 checks、missing evidence、blockers、next action。
  - [x] summary 文案必须明确 dry-run 未发布，避免“已发布”误读。
  - [x] summary 不泄露 token、环境变量或完整日志。

- [x] 增加 release fixtures 和 tests（AC: 1-6）
  - [x] 新增 `tests/runtime/release/release-dry-run.test.ts`。
  - [x] 新增 `tests/fixtures/release-candidate/release-dry-run-fixtures.json` 或等价 fixture。
  - [x] 测试覆盖 ready、not-releasable、no side effects、stale release evidence、missing check blocker、report summary。
  - [x] 如新增 contract schema 校验，放在 `tests/contracts/**` 或 release runtime test 中，确保 runtime verdict 与 `release-verdict.schema.json` 对齐。

- [x] 验证和记录（AC: 6）
  - [x] 运行 `npx vitest run tests/runtime/release/release-dry-run.test.ts`。
  - [x] 运行 `npm run typecheck`。
  - [x] 根据触达面运行 `npm run verify`；若修改 plugin manifest/hooks/registry/skills，再额外运行 `claude plugin validate ./plugins/curdx-flow` 和 `npm run test:claudecc`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

## Dev Notes

### 当前发现

- 当前仓库已有 `plugins/curdx-flow/schemas/release-verdict.schema.json`，但尚无 `src/runtime/release/**` runtime 实现。
- `package.json` 已有 `check-versions`、`check:hooks-fresh`、`test:claudecc`、`verify` 等发布前验证脚本；6.1 不应重新实现这些脚本，只建立 dry-run verdict 聚合模型。
- Architecture 明确 release gate 三层边界：`src/runtime/release/checks/`、`src/runtime/release/package/`、`src/runtime/release/publish/`；6.1 只做 release verdict/dry-run 基线，不执行真实 publish。
- Release checks 必须与 evidence/state/report 体系兼容，避免变成独立发布脚本清单。

### Previous Story Intelligence

- 5.2-5.5 多次 review 都发现“看似通过但审计链误导用户”的问题。6.1 要把 dry-run 和真实 release 状态分开：`release-ready` 只能表示“可发布但未发布”，不能暗示已经 push/tag/publish。
- 5.5 已建立 blocker report、actionable nextPlan 和 high-risk/destructive blocker 模式；6.1 的 release blocker 应复用同样的清晰 owner/remediation/risk 思路。
- 1.x evidence、verdict、report 相关 stories 已建立 no false completion 基线；release evidence 不得绕开 freshness、trust level 和 missingEvidence。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 发布前不再靠人工记忆确认 npm、Claude plugin、hook freshness、smoke 和 tag 状态；dry-run 不会误发布。 |
| Runtime Directory | `src/runtime/release/**`。 |
| Plugin Surface | 默认不修改 `plugins/curdx-flow` skill/agent/hook/manifest；仅在需要 schema 对齐时修改 `plugins/curdx-flow/schemas/release-verdict.schema.json`。 |
| Schema | `plugins/curdx-flow/schemas/release-verdict.schema.json` 必须与 runtime release verdict contract 对齐。 |
| Contract Test | 可在 `tests/contracts/**` 或 `tests/runtime/release/**` 校验 schema/runtime verdict 对齐。 |
| Runtime Test | `tests/runtime/release/release-dry-run.test.ts`。 |
| Adapter Test | 6.1 不调用真实外部发布适配器；使用 fake executor 证明 no side effects。 |
| Fixture | `tests/fixtures/release-candidate/release-dry-run-fixtures.json`。 |
| Evidence Output | 逻辑输出可映射到 `.curdx/reports/<run-id>.verdict.json` 和 release evidence block；本 story 可先用内存 contract + fixture。 |
| Report Surface | release summary 顶部显示 `not-published` / `release-ready` / `not-releasable`、version、npmTag、claudePluginTag、checks、missingEvidence、blockers、nextAction。 |
| Failure Mode | failed check、missing evidence、stale evidence、commit/version/tag mismatch、forbidden publish side effect。 |
| Verification Commands | `npx vitest run tests/runtime/release/release-dry-run.test.ts`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- `runtime release` 只产生 verdict，不执行真实 push/tag/npm publish/plugin release。
- `scripts/**` 可以作为验证命令载体，但不得成为唯一 release gate 真相来源。
- `release-ready` 必须表示“dry-run 判定可发布，但尚未发布”；summary 必须显式展示未发布。
- Push、tag、npm publish、Claude plugin release 属于 release-stage 高风险动作，必须由后续 Story 6.6 two-key 授权处理。
- 过期证据不得支撑 `release-ready`。
- 不要把 npm tag `vX.Y.Z` 和 Claude plugin tag `curdx-flow--vX.Y.Z` 当成同一个发布面。
- 不要在 6.1 修改 package/plugin version，也不要 push/tag/publish。

### Latest Claude Code Context

- Official Claude Code docs were checked on 2026-05-17 from `https://code.claude.com/docs/llms.txt`, `https://code.claude.com/docs/en/plugins-reference.md`, `https://code.claude.com/docs/en/plugin-dependencies.md`, and `https://code.claude.com/docs/en/plugins.md`.
- Current docs state plugin manifests live at `.claude-plugin/plugin.json`, plugin components live at plugin root, and `claude plugin validate` checks plugin manifest, skill/agent/command frontmatter, and `hooks/hooks.json` schema/syntax.
- Current docs state plugin dependency release tags use `{plugin-name}--v{version}` and `claude plugin tag --push` derives the tag from manifest/marketplace, validates plugin contents and version parity, requires a clean plugin working tree, and refuses duplicate tags. `--dry-run` shows what would be tagged without creating it.
- Current docs state plugin dependencies can use semver ranges and cross-marketplace dependencies require `allowCrossMarketplaceDependenciesOn`; these details belong in later parity/dependency stories, but 6.1 must leave fields for dependency/tag evidence.

### Files To Read Before Editing

**UPDATE candidates:**

- `plugins/curdx-flow/schemas/release-verdict.schema.json`
- `src/runtime/verdict/freshness.ts`
- `src/runtime/evidence/types.ts`
- `src/runtime/reports/renderer.ts`
- `src/runtime/reports/types.ts`
- `src/runtime/reports/summary.ts`

**NEW expected:**

- `src/runtime/release/types.ts`
- `src/runtime/release/dry-run.ts`
- `src/runtime/release/summary.ts`
- `src/runtime/release/index.ts`
- `tests/runtime/release/release-dry-run.test.ts`
- `tests/fixtures/release-candidate/release-dry-run-fixtures.json`

**Read-only context:**

- `package.json`
- `scripts/check-versions.mjs`
- `scripts/check-hooks-fresh.mjs`
- `scripts/claudecc-smoke.mjs`
- `plugins/curdx-flow/.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `tests/runtime/recovery/blocker-report.test.ts`
- `_bmad-output/implementation-artifacts/5-5-retry-caps-blocker-reports-recovery-fixtures.md`

## References

- `_bmad-output/planning-artifacts/epics.md#Story 6.1`
- `_bmad-output/planning-artifacts/prd.md#FR53`
- `_bmad-output/planning-artifacts/prd.md#FR58`
- `_bmad-output/planning-artifacts/prd.md#FR59`
- `_bmad-output/planning-artifacts/prd.md#FR76`
- `_bmad-output/planning-artifacts/prd.md#FR77`
- `_bmad-output/planning-artifacts/prd.md#NFR13`
- `_bmad-output/planning-artifacts/prd.md#NFR27`
- `_bmad-output/planning-artifacts/prd.md#NFR28`
- `_bmad-output/planning-artifacts/architecture.md#IP-REL-001`
- `_bmad-output/planning-artifacts/architecture.md#IP-REL-002`
- `_bmad-output/planning-artifacts/architecture.md#IP-REL-003`
- `_bmad-output/implementation-artifacts/5-5-retry-caps-blocker-reports-recovery-fixtures.md`
- `https://code.claude.com/docs/llms.txt`
- `https://code.claude.com/docs/en/plugins-reference.md`
- `https://code.claude.com/docs/en/plugin-dependencies.md`

## Dev Agent Record

### Agent Model Used

GPT-5

### Debug Log References

- `npx vitest run tests/runtime/release/release-dry-run.test.ts`：通过，6 tests。
- `npm run test:release`：通过，6 tests。
- `npm run test:contracts`：通过，12 tests。
- `npm run typecheck`：通过。
- `npm run verify`：通过；verify 已包含 `npm run test:release`。
- `claude plugin validate ./plugins/curdx-flow`：通过。
- Code review：发现 release tests 未接入主 `verify`，以及 `git tag --list` 被误判为真实 tag side effect；补测试后修复，复跑验证均通过。

### Completion Notes List

- 新增 `src/runtime/release/**` dry-run verdict 基线：`evaluateReleaseDryRun()` 输出 `release-ready` / `not-releasable`，并记录 version、npmTag、claudePluginTag、checks、missingEvidence、blockers、nextAction、riskLevel、trustLevel、freshness、sideEffects、`published: false` 和 `not-published`。
- 收紧 `release-verdict.schema.json` 与 runtime contract，移除旧的 `blocked` / `partial` release verdict，新增 run/goal/generatedAt、freshness、sideEffects、published、publicationState 和 summary 字段。
- 实现 release freshness：commit/version/npm tag/Claude plugin tag mismatch、stale/expired evidence、missing evidence 均阻止 `release-ready`。
- 实现 dry-run side effect gate：阻止 `git push`、真实 `git tag`、`npm publish`、`claude plugin tag --push`、plugin release；允许 `claude plugin tag --dry-run`、`claude plugin validate`、`npm run check-versions` 和只读 `git tag --list`。
- 新增 one-glance summary，顶部显示“未发布 / 可发布”或“未发布 / 不可发布”，避免把 dry-run 误读成已发布。
- 新增 `npm run test:release` 并接入 `npm run verify`，确保 release runtime tests 不漂在主门禁之外。

### File List

- `package.json`
- `src/runtime/contracts/index.ts`
- `src/runtime/release/types.ts`
- `src/runtime/release/dry-run.ts`
- `src/runtime/release/summary.ts`
- `src/runtime/release/index.ts`
- `plugins/curdx-flow/schemas/release-verdict.schema.json`
- `tests/runtime/release/release-dry-run.test.ts`
- `tests/fixtures/release-candidate/release-dry-run-fixtures.json`
- `tests/fixtures/contracts/valid/contracts.json`
- `_bmad-output/implementation-artifacts/6-1-release-evidence-model-dry-run-verdict.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented release dry-run verdict model, schema alignment, fixtures, release test gate, and review fixes; marked story done.

## Senior Developer Review (AI)

### Review Date

2026-05-17

### Review Outcome

Approve

### Findings

- Fixed [High]: release dry-run tests were initially only runnable as a direct Vitest command and were not included in `npm run verify`; added `npm run test:release` and wired it into verify.
- Fixed [Med]: side-effect detection treated all `git tag` invocations as release side effects, including read-only listing. Allowed `git tag --list` and equivalent read-only queries while still blocking real tag creation.

### Action Items

- [x] [High] Add release runtime tests to the main verify gate.
- [x] [Med] Permit read-only git tag queries in dry-run side-effect detection.

### Verification

- `npx vitest run tests/runtime/release/release-dry-run.test.ts`：通过，6 tests。
- `npm run test:release`：通过，6 tests。
- `npm run test:contracts`：通过，12 tests。
- `npm run typecheck`：通过。
- `npm run verify`：通过，包含 `npm run test:release`。
- `claude plugin validate ./plugins/curdx-flow`：通过。

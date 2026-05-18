# Story 1.1: 建立证据、状态、裁决与报告的合同基线

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为 curdx-flow 维护者，
我希望先建立 evidence、state、verdict、adapter result、report、hook gate 的 shipped schema、TypeScript 合同、runtime guard 和合同测试，
以便后续所有验证能力都使用同一套可信完成语言，而不是各自发明不兼容的 JSON 或提示词约定。

## Acceptance Criteria

1. **合同基线可发布：** `plugins/curdx-flow/schemas/` 至少新增并提交 evidence、state ledger、session、adapter result、completion verdict、release verdict、action-risk policy、hook gate output 的 JSON Schema；由于本 story 标题包含 report，必须同时提供 report 合同，可以是 `verification-report.schema.json` 或等价命名，但必须被 tests 覆盖。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.1`]
2. **TS 合同与 guard 对齐：** `src/runtime/contracts/**` 中存在与 shipped schema 匹配的 TypeScript 类型、normalizer/guard、结构化错误类型。跨边界数据不得只靠 `as Type` 或自然语言解析。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-SCHEMA-001`]
3. **有效 fixtures 双重通过：** 有效的 evidence、state、session、adapter result、completion verdict、release verdict、action-risk policy、report、hook gate fixtures 必须同时通过 shipped schema 校验和 TS guard 校验。
4. **兼容未来字段：** 在需要长期读取的边界上，guard 必须容忍并保留未知未来字段；测试必须证明 unknown fields 不会被无声丢弃。已知字段的非法枚举或非法类型仍必须失败。
5. **无效 payload 结构化失败：** 无效 JSON、缺失必填字段、过期/不支持的 `schemaVersion`、非法 verdict 值必须返回结构化错误，错误可以被转换为 blocker 或 degraded result。
6. **后续 story 开工门槛：** 如果后续实现 agent 新增跨边界 runtime 数据但没有 schema、type、guard、fixture 和 contract test，对应 story 不得视为完成。
7. **验证命令：** 最小验证必须包含 `npm run typecheck` 和新的合同测试命令。若实现修改 plugin-facing schema，发布前还必须运行 `claude plugin validate ./plugins/curdx-flow`。

## Tasks / Subtasks

- [x] 读取并冻结现有边界（AC: 1, 2）
  - [x] 完整读取 `package.json`，确认现有 scripts，新增合同测试脚本时保持 `verify` 链条语义清楚。
  - [x] 完整读取 `plugins/curdx-flow/schemas/spec.schema.json`，保留现有 spec/workflow state 合同；不要把新 runtime 合同硬塞进旧 monolith，除非有迁移理由。
  - [x] 完整读取 `src/hooks/_shared/types.ts` 和 `plugins/curdx-flow/references/iron-law-verification.md`，理解现有 hook state/verification block，不要破坏旧 hook 行为。
  - [x] 完整读取 `vitest.config.ts` 和现有 `tests/**/*.test.ts`，沿用 Vitest 风格。

- [x] 新增 shipped schema 合同（AC: 1, 3, 4, 5）
  - [x] 在 `plugins/curdx-flow/schemas/` 新增 `evidence.schema.json`、`state-ledger.schema.json`、`session.schema.json`、`adapter-result.schema.json`、`completion-verdict.schema.json`、`release-verdict.schema.json`、`action-risk-policy.schema.json`、`hook-gate.schema.json`。
  - [x] 新增 report 合同 schema，建议命名为 `verification-report.schema.json`，覆盖 Markdown/JSON report 的机器可读投影。
  - [x] 每个 schema 使用 draft 2020-12、稳定 `$id`、`schemaVersion`、required fields、枚举和清晰的 privacy/freshness/blocker 结构。
  - [x] 兼容性边界顶层允许 unknown fields 或通过 guard 保留 unknown fields；不要用 `additionalProperties: false` 导致未来版本完全不可读，除非是纯配置而非运行时事实。

- [x] 新增 TypeScript runtime contracts（AC: 2, 4, 5）
  - [x] 新建 `src/runtime/contracts/`，至少包含类型定义、guard helpers、structured issue/result 类型和 schema/path mapping。
  - [x] Guard 返回 `ok: true` 的 normalized value 或 `ok: false` 的 issue list；issue 至少包含 `schemaId`、`path`、`code`、`message`。
  - [x] Guard 必须区分 `blocked` 与 `degraded` 可转换错误，不要在 runtime contract 层输出自然语言-only failure。
  - [x] 不要从 `plugins/curdx-flow/**` 直接 import repo-only runtime source；plugin root 是 installed distribution surface，不是 TypeScript source consumer。

- [x] 新增 fixtures 与合同测试（AC: 3, 4, 5, 6）
  - [x] 新建 `tests/fixtures/contracts/valid/` 与 `tests/fixtures/contracts/invalid/`，每个合同至少一个 valid fixture 和三个 invalid cases：missing required、bad enum/type、unsupported `schemaVersion`。
  - [x] 新建 `tests/contracts/**`，验证 shipped schema 与 TS guard 都会检查同一 fixture。
  - [x] 增加 unknown future field fixture，证明 guard 会保留或容忍未知字段。
  - [x] 增加 invalid JSON / parse failure 测试，证明错误是结构化 issue，而不是 thrown string 或自然语言判断。

- [x] 更新测试脚本与依赖（AC: 3, 7）
  - [x] 建议新增 `npm run test:contracts`，执行 `vitest run tests/contracts`。
  - [x] 如果使用 JSON Schema validator，优先使用 devDependencies：`ajv@8.20.0` 和 `ajv-formats@3.0.1`（2026-05-16 本地 `npm view` 核对）。不要把 Ajv 加入 production dependency，除非 runtime CLI 在发布包里实际需要运行 schema validator。
  - [x] 如果不使用 Ajv，必须实现明确的 schema validation 测试策略；不得只跑 TS guard 却宣称 shipped schema 已验证。
  - [x] 若更新 `package.json`，同步 `package-lock.json`，使用 npm，不能新增其他 lockfile。

- [x] 验证与完成记录（AC: 6, 7）
  - [x] 运行 `npm run typecheck`。
  - [x] 运行新的合同测试命令，例如 `npm run test:contracts`。
  - [x] 若 plugin-facing schema 新增后需要验证插件包结构，运行 `claude plugin validate ./plugins/curdx-flow` 并记录结果。
  - [x] 在 dev record 中列出新增/修改文件、验证命令和任何未验证范围；不得用“basic/v1/static for now/wire later”作为完成理由。

### Review Findings

- [x] [Review][Patch] Runtime guard accepts payloads the shipped schemas reject [src/runtime/contracts/index.ts:445]

## Dev Notes

### 当前发现

- 自动选择的 story key 是 `1-1-evidence-status-verdict-report-contract-baseline`；这是 Epic 1 的第一条 story，无 previous story intelligence。
- 本地 `claude --version` 当前为 `2.1.143 (Claude Code)`；`claude plugin validate ./plugins/curdx-flow` 当前通过。实现后仍需重新运行相关验证，因为新增 schema/test 会改变插件产品面。
- 当前仓库只有 `tests/analyze/parser.test.ts` 和 `tests/runner/capabilities.test.ts`；`tests/contracts/` 是本 story 的新测试面。
- 现有 shipped schema 只有 `spec.schema.json` 与 `transcript-events.json`。`spec.schema.json` 已覆盖旧 `.curdx-state.json`/verification block，不等同于新的 evidence/state/verdict/report 合同。
- 当前没有 `src/runtime/**`；本 story 是 runtime contract layer 的入口，不应从 hooks、skills 或 concrete adapters 直接开工。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 后续 agent 不再猜 evidence/state/verdict/report JSON 长什么样，减少 false completion 和跨模块漂移。 |
| Runtime Directory | 新增 `src/runtime/contracts/**`。不要把 planner/evidence ledger/verdict evaluator 的完整实现放进本 story。 |
| Plugin Surface | 新增 `plugins/curdx-flow/schemas/**` shipped contracts；不改 slash command、agent id、hook path、plugin id。 |
| Schema | 新增 evidence、state-ledger、session、adapter-result、completion-verdict、release-verdict、action-risk-policy、hook-gate、verification-report。 |
| Contract Test | 新增 `tests/contracts/**`，schema validation + TS guard validation + unknown field compatibility。 |
| Runtime Test | 本 story可不新增 `tests/runtime/**`，除非 guard helpers 进入 runtime behavior；合同测试是核心。 |
| Adapter Test | 不需要；adapter side effects 不是本 story 范围。 |
| Fixture | 新增 `tests/fixtures/contracts/{valid,invalid}/**/*.json`。 |
| Evidence Output | 本 story只定义合同，不写 `.curdx/**` runtime evidence。 |
| Report Surface | 定义 `verification-report.schema.json` 或等价机器可读报告合同。 |
| Failure Mode | invalid JSON、missing required、unsupported schemaVersion、bad verdict enum 必须结构化失败。 |
| Verification Commands | `npm run typecheck`、`npm run test:contracts`、必要时 `claude plugin validate ./plugins/curdx-flow`。 |

### Contract Shape Guidance

Use `schemaVersion: 1` for new contracts unless the implementation documents a better shared versioning choice. Keep field names camelCase.

`EvidenceBlock` minimum fields:

- `schemaVersion`, `id`, `runId`, `goalId`, `source`, `capabilityId`, `trustLevel`, `status`, `summary`
- `artifacts`, `startedAt`, `completedAt`, `freshness`, `privacy`, `redactions`
- Optional lineage fields: `attemptId`, `relatedEvidenceIds`, `supersedes`, `unverifiedScope`

`StateLedger` / `Session` minimum fields:

- `runId`, `goalId`, `workspaceRoot`, `mode`, `policy`, `scope`, `expectedJourney`
- `status`, `phase`, `startedAt`, `updatedAt`, `evidenceIds`, `artifactIndexPath`, `nextAction`
- Session-specific resume/checkpoint fields that let the reboot test answer: where am I, what was verified, what is missing, what happens next.

`AdapterResult` minimum fields:

- `ok`, `status`, `capabilityId`, `inputs`, `evidence`, `blockers`, `artifacts`, `diagnostics`, `retryable`, `confidence`, `durationMs`
- Adapter result must never decide business completion; verdict evaluator owns completion/release decisions.

`CompletionVerdict` minimum fields:

- `verdict`: `complete | blocked | partial | manual-confirmation-required | release-ready`
- `why`, `evidenceRefs`, `missingEvidence`, `nextAction`, `owner`, `riskLevel`, `confidence`, `unverifiedScope`

`ReleaseVerdict` minimum fields:

- `version`, `npmTag`, `claudePluginTag`, `checks`, `missingEvidence`, `blockers`, `nextAction`, `riskLevel`
- Keep npm tag `vX.Y.Z` and Claude plugin tag `curdx-flow--vX.Y.Z` as separate fields.

`HookGateOutput` minimum fields:

- `eventName`, `runId`, `goalId`, `decision`, `reason`, `missingEvidence`, `nextAction`, `failOpen`, `diagnostics`
- Keep it event-specific. Not every Claude Code hook event supports block/context behavior.

`VerificationReport` minimum fields:

- `runId`, `goalId`, `status`, `verdict`, `summary`, `evidenceRefs`, `artifactIndex`, `blockers`, `missingEvidence`, `generatedAt`, `privacy`
- Report is a projection of state/evidence/verdict, not a new fact source.

### Files To Read Before Editing

**UPDATE candidates:**

- `package.json`: current scripts include `typecheck`, `test:hooks`, `test:analyze`, `test:runner`, `test:claudecc`, `verify`; add `test:contracts` only if this story implements the command.
- `package-lock.json`: update only if adding Ajv or other npm dependencies.
- `plugins/curdx-flow/schemas/spec.schema.json`: preserve current spec/verification block behavior; do not break existing hooks.
- `src/hooks/_shared/types.ts`: read for compatibility, but avoid editing unless absolutely necessary. If any `src/hooks/**` file changes, run `npm run build:hooks` and `npm run check:hooks-fresh`.
- `vitest.config.ts`: tests already include `tests/**/*.test.ts`; likely no edit required.

**NEW expected:**

- `plugins/curdx-flow/schemas/evidence.schema.json`
- `plugins/curdx-flow/schemas/state-ledger.schema.json`
- `plugins/curdx-flow/schemas/session.schema.json`
- `plugins/curdx-flow/schemas/adapter-result.schema.json`
- `plugins/curdx-flow/schemas/completion-verdict.schema.json`
- `plugins/curdx-flow/schemas/release-verdict.schema.json`
- `plugins/curdx-flow/schemas/action-risk-policy.schema.json`
- `plugins/curdx-flow/schemas/hook-gate.schema.json`
- `plugins/curdx-flow/schemas/verification-report.schema.json`
- `src/runtime/contracts/**`
- `tests/contracts/**`
- `tests/fixtures/contracts/**`

### Architecture Guardrails

- Runtime core owns decisions; adapters own side effects; plugin owns distribution surface; hooks own gates; reports own presentation; registry owns declarations. [Source: `_bmad-output/planning-artifacts/architecture.md#Why This Structure Exists`]
- `plugins/curdx-flow/**` is the shipped Claude Code plugin product surface. Do not rename public skill names, agent filenames, hook paths, marketplace ids, dependency ids, or release tag identity. [Source: `_bmad-output/project-context.md#Product Surface`]
- TypeScript source is canonical; generated hook bundles are committed shipping artifacts. Do not hand-edit `plugins/curdx-flow/hooks/scripts/**`. [Source: `_bmad-output/project-context.md#Canonical Sources`]
- State/evidence/report artifacts created at runtime belong under target workspace `.curdx/**`, not in shipped plugin source. This story only defines schemas and fixtures. [Source: `_bmad-output/planning-artifacts/architecture.md#Workspace Artifact Boundary`]
- Cross-boundary data must have schema, TypeScript type, runtime guard, fixture, and contract test. [Source: `_bmad-output/planning-artifacts/architecture.md#IP-SCHEMA-002`]
- Existing state migrations must preserve unknown fields where practical and recover from malformed state; do not silently discard user context. [Source: `_bmad-output/project-context.md#Critical Dont-Miss Rules`]

### Latest Claude Code / Library Information

- Official docs were rechecked via `https://code.claude.com/docs/llms.txt` during story creation. Relevant docs: plugins, plugins-reference, plugin-dependencies, hooks, goal.
- Claude Code plugin root structure and behavior must be validated with `claude plugin validate ./plugins/curdx-flow`; local validation passed before story creation, but implementation must rerun after schema/test changes. Source: <https://code.claude.com/docs/en/plugins-reference>.
- Hook stdout/stderr and event semantics are protocol-sensitive. Hook output should be JSON only when the event expects JSON; diagnostics belong on stderr/logs. Source: <https://code.claude.com/docs/en/hooks>.
- `/goal` requires current Claude Code support and visible transcript evidence; it does not replace schemas or contract tests. Source: <https://code.claude.com/docs/en/goal>.
- Plugin dependency release/version behavior remains separate from npm release tags; versioned plugin dependencies resolve from plugin tags like `{plugin-name}--v{version}`. Source: <https://code.claude.com/docs/en/plugin-dependencies>.
- If schema tests use Ajv, current npm registry versions checked locally are `ajv@8.20.0` and `ajv-formats@3.0.1`. Treat these as test tooling unless runtime CLI needs actual schema validation in production.

### Previous Story Intelligence

None. This is the first story in Epic 1 and the first sprint story.

### Known Risks To Prevent

- Do not implement a full evidence ledger writer, verdict evaluator, report generator, or hook gate workflow in this story. Build the contracts that make those later stories safe.
- Do not create duplicate state interfaces in every module. Shared runtime contracts must be reusable.
- Do not loosen existing hook behavior by changing `src/hooks/_shared/types.ts` casually. Story 1.6 owns hook boundary tests.
- Do not add new runtime dependencies without deciding whether the installed plugin and npm CLI can actually load them.
- Do not claim shipped schema validation if tests only validate TypeScript guards.
- Do not hide critical completion proof only in files. Future `/goal` and report surfaces need transcript-visible summaries, but this story only defines the contract.

## Project Structure Notes

- Alignment: story creates the target runtime contract layer described by architecture without disturbing existing CLI/registry/hook/plugin public identities.
- Detected conflict: current legacy `spec.schema.json` includes a broad state definition and verification block. The new contracts should not replace it in one step; bridge or migration belongs to later state/evidence stories.
- UX note: no standalone UX document exists. Report UX requirements are embedded in PRD/architecture and only require machine-readable + reviewer-readable report contracts here.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 1.1`
- `_bmad-output/planning-artifacts/prd.md#Evidence-Based Verification`
- `_bmad-output/planning-artifacts/prd.md#Reporting & Review`
- `_bmad-output/planning-artifacts/architecture.md#Target Runtime Structure`
- `_bmad-output/planning-artifacts/architecture.md#IP-SCHEMA-001`
- `_bmad-output/planning-artifacts/architecture.md#IP-EVIDENCE-001`
- `_bmad-output/planning-artifacts/architecture.md#IP-HOOK-001`
- `_bmad-output/project-context.md`
- `plugins/curdx-flow/references/iron-law-verification.md`
- `plugins/curdx-flow/skills/curdx-core/references/state-file-schema.md`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>
- Claude Code plugins reference: <https://code.claude.com/docs/en/plugins-reference>
- Claude Code hooks docs: <https://code.claude.com/docs/en/hooks>
- Claude Code goal docs: <https://code.claude.com/docs/en/goal>
- Claude Code plugin dependencies docs: <https://code.claude.com/docs/en/plugin-dependencies>

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- `npm run test:contracts` initially failed because `src/runtime/contracts/index.ts` did not exist, confirming the red test path.
- `npm run test:contracts` passed after adding shipped schemas, runtime guards, and fixtures.
- `npm run verify` passed after adding `test:contracts` to the verify chain.
- `claude plugin validate ./plugins/curdx-flow` passed after plugin-facing schema additions.
- Review patch validation passed: `npm run test:contracts`, `npm run typecheck`, and `npm run verify`.

### Implementation Plan

- Keep this story scoped to contracts only: shipped JSON schemas, TypeScript type/guard boundaries, fixtures, and contract tests.
- Use Ajv only as dev-time test tooling for shipped schema validation; runtime guards stay dependency-light and do not import Ajv.
- Preserve forward compatibility by allowing unknown top-level fields in schemas and returning validated payloads without stripping future fields.
- Connect `npm run test:contracts` into `npm run verify` so contract drift is checked by the release-quality gate.

### Completion Notes List

- Added nine shipped runtime contract schemas: evidence, state ledger, session, adapter result, completion verdict, release verdict, action-risk policy, hook gate, and verification report.
- Added `src/runtime/contracts/index.ts` with shared TypeScript interfaces, schema path mapping, `validateContract`, `parseContractJson`, and structured issue output.
- Added valid, unknown-field, missing-required, bad-enum, unsupported-version, and malformed-JSON fixtures.
- Added `tests/contracts/runtime-contracts.test.ts` covering schema validation, TS guard validation, unknown field preservation, and structured parse failures.
- Added dev-only Ajv/Ajv Formats dependencies and wired `npm run test:contracts` into `npm run verify`.
- Resolved review finding by making runtime guards enforce schema-only constraints: string `minLength`, date-time format, release tag patterns, and array item object/string checks.
- Added `schema-only-rules.json` fixture and contract test coverage to prevent guard/schema drift.
- Verification passed: `npm run typecheck`, `npm run test:contracts`, `npm run test:runner`, `npm run test:analyze`, `npm run verify`, and `claude plugin validate ./plugins/curdx-flow`.

### File List

- `_bmad-output/implementation-artifacts/1-1-evidence-status-verdict-report-contract-baseline.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `package.json`
- `package-lock.json`
- `plugins/curdx-flow/schemas/action-risk-policy.schema.json`
- `plugins/curdx-flow/schemas/adapter-result.schema.json`
- `plugins/curdx-flow/schemas/completion-verdict.schema.json`
- `plugins/curdx-flow/schemas/evidence.schema.json`
- `plugins/curdx-flow/schemas/hook-gate.schema.json`
- `plugins/curdx-flow/schemas/release-verdict.schema.json`
- `plugins/curdx-flow/schemas/session.schema.json`
- `plugins/curdx-flow/schemas/state-ledger.schema.json`
- `plugins/curdx-flow/schemas/verification-report.schema.json`
- `src/runtime/contracts/index.ts`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/fixtures/contracts/invalid/bad-enum.json`
- `tests/fixtures/contracts/invalid/missing-required.json`
- `tests/fixtures/contracts/invalid/not-json.json`
- `tests/fixtures/contracts/invalid/schema-only-rules.json`
- `tests/fixtures/contracts/invalid/unsupported-version.json`
- `tests/fixtures/contracts/valid/contracts.json`
- `tests/fixtures/contracts/valid/unknown-fields.json`

### Change Log

- 2026-05-16: Implemented Story 1.1 contract baseline and moved story to review.
- 2026-05-16: Resolved code review patch finding and moved story to done.

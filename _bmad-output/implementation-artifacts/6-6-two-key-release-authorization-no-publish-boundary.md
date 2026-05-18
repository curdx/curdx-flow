# Story 6.6: Two-Key Release Authorization and No-Publish Boundary

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为负责 curdx-flow 发布的维护者，
我希望真实 push、tag、npm publish 和 Claude plugin release 必须同时满足 release gate 通过与显式 release-stage 授权，
以便 dry-run 永远不会意外变成真实发布，普通验证流程也不会顺手推送或打 tag。

## Acceptance Criteria

1. **No authorization means no publish：** 给定 release dry-run 已通过，当用户没有显式 release-stage 授权，系统不得执行 push、tag、npm publish、`claude plugin tag --push` 或任何真实发布动作；report 只能输出 ready 状态和下一步命令建议。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.6`; `_bmad-output/planning-artifacts/architecture.md#IP-REL-001`; `_bmad-output/implementation-artifacts/6-1-release-evidence-model-dry-run-verdict.md`]
2. **Authorization cannot bypass gate failure：** 给定用户提供 release-stage 授权，当 release gate 仍存在 blocker、missingEvidence、stale evidence 或 tag parity incomplete，系统仍不得发布；必须说明授权存在但证据门禁未通过。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.6`; `_bmad-output/planning-artifacts/prd.md#FR58`; `_bmad-output/planning-artifacts/prd.md#FR77`]
3. **Authorized release action record：** 给定 release gate 通过且用户显式授权，当系统准备真实发布动作，必须记录授权文本或授权来源、命令、风险等级、目标 version、目标 npm tag、目标 plugin tag、预期副作用；执行结果必须写入 release evidence。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.6`; `_bmad-output/planning-artifacts/architecture.md#IP-REL-002`]
4. **Ordinary flows remain dry-run only：** 给定普通验证、report-only、fix mode、doctor 或 smoke 流程，当这些流程触发 release checks，只能执行 dry-run 或 readiness 检查；不得因为检查通过而自动执行真实发布动作。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.6`; `_bmad-output/planning-artifacts/prd.md#NFR13`; `_bmad-output/planning-artifacts/prd.md#NFR28`]
5. **Partial release recovery：** 给定真实发布动作部分成功，例如 npm tag 已推但 plugin tag 失败，当 release report 生成，状态必须为 incomplete 或 blocked；report 必须给出恢复步骤、远端 tag 状态和禁止继续假装发布完成的说明。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.6`; `_bmad-output/implementation-artifacts/6-5-npm-tag-claude-plugin-tag-parity.md`]
6. **验证覆盖：** 给定 Story 6.6 完成，当执行验证，最小验证命令必须包含 release two-key tests、dry-run no-publish tests、partial release recovery tests；测试必须覆盖无授权、有授权但 gate fail、gate pass + 授权记录、普通流程 no-publish、partial remote tag failure。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.6`]

## Tasks / Subtasks

- [x] 定义 release authorization / no-publish contract（AC: 1-6）
  - [x] 在 `src/runtime/release/types.ts` 增加 release authorization、release action intent、authorized action record、two-key result 类型。
  - [x] 新增 `src/runtime/release/authorization.ts`，导出 `evaluateReleaseAuthorizationGate()` 或等价函数。
  - [x] 输出必须包含 checks、blockers、missingEvidence、authorization、actionRecords、sideEffects、nextAction 和 publication state。

- [x] 实现 no-authorization no-publish boundary（AC: 1,4）
  - [x] release gate passed 但无 release-stage 授权时，不得允许真实 publish/tag/push/plugin release。
  - [x] 普通验证/report-only/fix/doctor/smoke context 必须保持 dry-run/readiness-only。
  - [x] report 必须只给出 ready 状态和下一步授权建议，不得输出可直接执行的 side-effect 命令。

- [x] 实现 authorization cannot bypass failed gate（AC: 2,5）
  - [x] 授权存在但 release blockers/missingEvidence/stale evidence/tag parity incomplete 时必须 blocked。
  - [x] partial remote tag failure 必须输出 incomplete/blocked，并包含恢复步骤。
  - [x] 不得把 authorization 当成 release evidence 的替代。

- [x] 实现 authorized action record（AC: 3）
  - [x] gate passed + explicit release-stage authorization 时，生成 action records。
  - [x] 每个 record 必须包含授权来源/文本、命令、riskLevel、version、npmTag、claudePluginTag、expectedSideEffects。
  - [x] 不执行命令；只形成 release evidence-ready record。

- [x] 增加 release two-key fixtures/tests（AC: 1-6）
  - [x] 新增 `tests/runtime/release/authorization.test.ts`。
  - [x] 新增 `tests/fixtures/release-candidate/release-authorization-fixtures.json` 或等价 fixture。
  - [x] 覆盖无授权、有授权但 gate fail、gate pass + 授权记录、普通流程 no-publish、partial remote tag failure。
  - [x] 保持 `npm run test:release` 和 `npm run verify` 覆盖 two-key tests。

- [x] 验证和记录（AC: 6）
  - [x] 运行 `npm run test:release`。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

## Dev Notes

### 当前发现

- 6.1 已实现 release dry-run：dry-run passed 时 `nextAction.requiresReleaseStageAuthorization = true`，且 forbidden side effects 被识别为 blocker。
- 6.5 已实现 tag parity：`npm-only` / `plugin-only` 返回 `incomplete` 并阻塞 dry-run release-ready；no-tag state 表示可在授权后成对发布。
- `src/runtime/policy/action-risk-policy.ts` 已有通用高风险授权策略，但 6.6 需要 release-specific evidence gate，不能只复用普通 action policy。
- `src/runtime/contracts/index.ts` 已允许 release verdict payload 带 `authorization` 对象字段；若 6.6 把 authorization 写入 release verdict schema，应同步 contract/schema。

### Previous Story Intelligence

- 6.1：真实 push/tag/npm publish/Claude plugin release 是 forbidden release side effect，dry-run 不发布。
- 6.4：Claude plugin validation 和 installed smoke evidence 是 release readiness 的必要条件。
- 6.5：tag parity incomplete 是 release blocker，不能靠授权绕过。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 防止验证通过后自动或误操作真实 tag/push/npm publish/plugin release；发布动作必须有证据和明确授权。 |
| Runtime Directory | `src/runtime/release/**`。 |
| Plugin Surface | 不修改 plugin metadata；发布动作仍是外部 side-effect，不由 runtime gate 执行。 |
| Schema | 不新增 schema；复用 release check/verdict contract。若新增 authorization 字段进入 shipped schema，必须同步 `release-verdict.schema.json`。 |
| Contract Test | Runtime output 必须让 dry-run/no-publish boundary 可被 release report 消费。 |
| Runtime Test | `tests/runtime/release/authorization.test.ts`。 |
| Adapter Test | 不调用真实 git/npm/claude release 命令；fixture 模拟 release gate 和 tag state。 |
| Fixture | `tests/fixtures/release-candidate/release-authorization-fixtures.json`。 |
| Evidence Output | authorization state、action records、blocked reasons、partial release recovery steps。 |
| Report Surface | ready/no-auth、authorized-but-blocked、authorized-action-records、ordinary-flow no-publish、partial-release blocked。 |
| Failure Mode | no authorization、gate failed despite authorization、ordinary flow attempted release, partial remote tag failure。 |
| Verification Commands | `npm run test:release`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- 6.6 仍然不得执行真实发布动作；只能生成 authorization/action records。
- 授权必须是显式 release-stage 授权，普通“继续”“1”“可以”不能被当成发布授权。
- 普通验证、doctor、smoke、report-only、fix mode 永远是 no-publish context。
- Partial release 不是成功；必须保留 incomplete/blocked 状态直到两个发布面恢复一致。

### Latest Claude Code Context

- Official Claude Code docs were checked on 2026-05-17 from `https://code.claude.com/docs/llms.txt` and `https://code.claude.com/docs/en/plugin-dependencies.md`.
- Current docs state `claude plugin tag --push` creates/pushes plugin release tags after validation; this remains a real release side effect and must not be run by dry-run or ordinary verification flows.

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/release/types.ts`
- `src/runtime/release/index.ts`

**NEW expected:**

- `src/runtime/release/authorization.ts`
- `tests/runtime/release/authorization.test.ts`
- `tests/fixtures/release-candidate/release-authorization-fixtures.json`

**Read-only context:**

- `src/runtime/release/dry-run.ts`
- `src/runtime/release/tag-parity.ts`
- `src/runtime/policy/action-risk-policy.ts`
- `src/runtime/contracts/index.ts`
- `tests/runtime/release/release-dry-run.test.ts`
- `tests/runtime/release/tag-parity.test.ts`
- `_bmad-output/implementation-artifacts/6-1-release-evidence-model-dry-run-verdict.md`
- `_bmad-output/implementation-artifacts/6-5-npm-tag-claude-plugin-tag-parity.md`

## References

- `_bmad-output/planning-artifacts/epics.md#Story 6.6`
- `_bmad-output/planning-artifacts/prd.md#FR58`
- `_bmad-output/planning-artifacts/prd.md#FR77`
- `_bmad-output/planning-artifacts/prd.md#NFR13`
- `_bmad-output/planning-artifacts/prd.md#NFR28`
- `_bmad-output/planning-artifacts/architecture.md#IP-REL-001`
- `_bmad-output/planning-artifacts/architecture.md#IP-REL-002`
- `_bmad-output/planning-artifacts/architecture.md#Release-Boundary`
- `_bmad-output/implementation-artifacts/6-1-release-evidence-model-dry-run-verdict.md`
- `_bmad-output/implementation-artifacts/6-5-npm-tag-claude-plugin-tag-parity.md`
- `https://code.claude.com/docs/llms.txt`
- `https://code.claude.com/docs/en/plugin-dependencies.md`

## Dev Agent Record

### Agent Model Used

GPT-5

### Debug Log References

- Red phase: `npm run test:release -- tests/runtime/release/authorization.test.ts` failed because `evaluateReleaseAuthorizationGate` was not exported yet.
- Green/refactor: `npm run test:release -- tests/runtime/release/authorization.test.ts` passed; release suite reported 6 files / 41 tests after ordinary dry-run-only coverage was added.
- Regression: `npm run test:release` passed with 6 files / 41 tests.
- Static checks: `npm run typecheck` passed.
- Full gate: `npm run verify` passed, including contracts, runtime suites, release tests, version parity, hook freshness, build, bundle size, hook tests, analyze, runner, and verification-block checks.

### Completion Notes List

- Implemented a pure two-key release authorization evaluator that never executes git, npm, or Claude plugin commands.
- `ready-no-auth` now keeps release-ready evidence unpublished with no action records and no side-effect command output.
- Explicit release-stage authorization cannot bypass failed release gate evidence, missing evidence, stale evidence, or tag parity problems.
- Authorized release context creates evidence-ready action records containing authorization source/text, command, risk, version, npm tag, Claude plugin tag, and expected side effects.
- Ordinary doctor/smoke/report/fix/verification flows remain no-publish: release side-effect attempts are blocked, and side-effect-free readiness flows return `dry-run-only`.
- Partial remote tag state returns `incomplete` with recovery guidance for the paired npm and Claude plugin tags.
- Senior developer review completed locally after implementation; outcome: Approve, no follow-up findings.

### File List

- `src/runtime/release/types.ts`
- `src/runtime/release/authorization.ts`
- `src/runtime/release/index.ts`
- `tests/runtime/release/authorization.test.ts`
- `tests/fixtures/release-candidate/release-authorization-fixtures.json`
- `_bmad-output/implementation-artifacts/6-6-two-key-release-authorization-no-publish-boundary.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented two-key release authorization/no-publish boundary with release action records and partial-release recovery coverage.
- 2026-05-17: Completed senior developer review; approved with no required follow-ups.

## Senior Developer Review (AI)

### Review Date

2026-05-17

### Reviewer

GPT-5

### Outcome

Approve

### Findings

No findings.

### Action Items

None.

# Story 6.5: Npm Tag and Claude Plugin Tag Parity

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为发布 curdx-flow 的维护者，
我希望 release gate 同时检查 npm release tag 和 Claude plugin release tag，
以便避免只发布了 npm 包或只发布了 plugin tag，导致用户安装、依赖解析或升级路径不完整。

## Acceptance Criteria

1. **Tag calculation：** 给定当前版本为 `X.Y.Z`，当 release gate 计算发布 tag，npm release tag 必须为 `vX.Y.Z`，Claude plugin tag 必须为 `curdx-flow--vX.Y.Z`，两者不得混用。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.5`; `_bmad-output/planning-artifacts/architecture.md#Release-Boundary`; `_bmad-output/planning-artifacts/prd.md#FR57`]
2. **Remote tag state parity：** 给定 release gate 检查远端 tag 状态，当查询 `origin` 上的 `vX.Y.Z` 和 `curdx-flow--vX.Y.Z`，必须报告两者是否存在、是否缺一、是否都不存在、是否都已存在；只存在一个 tag 时 release verdict 必须为 `not-releasable` 或 `incomplete` blocker。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.5`; `_bmad-output/planning-artifacts/prd.md#FR59`; `_bmad-output/planning-artifacts/architecture.md#IP-REL-002`]
3. **Incomplete parity guidance：** 给定 version parity 通过但 tag parity 不完整，当 release report 生成，报告必须说明 npm release surface 与 Claude plugin dependency surface 的差异，并给出安全恢复步骤，不得建议继续发布另一个 surface 前忽略现有不完整状态。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.5`; `_bmad-output/planning-artifacts/research/technical-claude-code-plugin-latest-architecture-and-release-mechanics-for-curdx-flow-optimization-research-2026-05-15.md`]
4. **Plugin dependency tag readiness：** 给定 plugin dependencies 使用版本解析，当 release gate 检查 Claude plugin tag readiness，必须说明 plugin dependency resolution 依赖 `{plugin-name}--v{version}` tag；缺少 plugin tag 必须阻塞 plugin release readiness。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.5`; `https://code.claude.com/docs/en/plugin-dependencies.md`]
5. **Dry-run no side effects：** 给定 release dry-run 模式，当 tag parity check 执行，只能读取本地/远端 tag 状态，不得创建、本地打 tag、推送 tag 或调用 `claude plugin tag --push`。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.5`; `_bmad-output/implementation-artifacts/6-1-release-evidence-model-dry-run-verdict.md`]
6. **验证覆盖：** 给定 Story 6.5 完成，当执行验证，最小验证命令必须包含 tag parity tests 和 release dry-run tests；测试必须覆盖无 tag、只有 npm tag、只有 plugin tag、两 tag 都存在、版本/tag 不匹配、dry-run no side effect。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.5`]

## Tasks / Subtasks

- [x] 定义 tag parity release contract（AC: 1-6）
  - [x] 在 `src/runtime/release/types.ts` 增加 tag identity、remote tag state、tag parity report/guidance 类型。
  - [x] 新增 `src/runtime/release/tag-parity.ts`，导出 `evaluateReleaseTagParity()` 或等价函数。
  - [x] 输出必须可作为 6.1 `evaluateReleaseDryRun()` 的 check input，并包含 checks、blockers、missingEvidence、verifiedSurfaces、guidance、readOnlyCommands。

- [x] 实现 tag identity 计算（AC: 1,4）
  - [x] 从 version `X.Y.Z` 派生 npm tag `vX.Y.Z`。
  - [x] 从 plugin name/version 派生 Claude plugin tag `{plugin-name}--v{version}`，curdx-flow 当前为 `curdx-flow--vX.Y.Z`。
  - [x] version/tag mismatch 必须阻塞 release readiness，并说明 npm 与 Claude plugin tag 不可混用。

- [x] 实现 remote tag state parity（AC: 2,3）
  - [x] 输入只读 tag 查询结果，判断 `none`、`npm-only`、`plugin-only`、`both`、`mismatch`。
  - [x] 只存在一个 tag 或版本/tag 不匹配时必须生成 blocker。
  - [x] 报告必须区分 npm release surface 与 Claude plugin dependency surface，并输出安全恢复步骤。

- [x] 实现 dry-run no side-effect 保护（AC: 5）
  - [x] read-only commands 只能包含 `git ls-remote --tags origin <tag>` 或等价查询。
  - [x] 若 plannedCommands 包含 `git tag` 创建、`git push`、`npm publish`、`claude plugin tag --push` 等真实发布动作，必须阻塞。
  - [x] 不得在 runtime gate 内执行真实 git/claude/npm 命令；只消费 evidence。

- [x] 增加 release tag parity fixtures/tests（AC: 1-6）
  - [x] 新增 `tests/runtime/release/tag-parity.test.ts`。
  - [x] 新增 `tests/fixtures/release-candidate/tag-parity-fixtures.json` 或等价 fixture。
  - [x] 覆盖 no tags、npm-only、plugin-only、both tags、version/tag mismatch、dry-run no side effect。
  - [x] 保持 `npm run test:release` 和 `npm run verify` 覆盖 tag parity tests。

- [x] 验证和记录（AC: 6）
  - [x] 运行 `npm run test:release`。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

## Dev Notes

### 当前发现

- 6.1 `evaluateReleaseDryRun()` 已默认从 version 派生 npm tag `v${version}` 和 Claude plugin tag `curdx-flow--v${version}`，并且已经阻止 `git push`、真实 `git tag`、`npm publish`、`claude plugin tag --push`、plugin release side effects。
- 6.2 `evaluateReleaseParity()` 已验证 version surfaces 一致；6.5 不要重复实现 version parity，而是消费已通过的 version context 并专注 tag state。
- `scripts/bump-version.mjs` 只负责同步版本字段，不创建 git tag；脚本最后的提示仍是人类 release SOP，不是 6.5 runtime gate 行为。
- 当前 release runtime 尚无 tag parity evaluator；新增逻辑应保持 pure/evidence-only，不直接访问网络或 git remote。

### Previous Story Intelligence

- 6.1 建立 dry-run side-effect boundary：真实 tag/push/publish/plugin tag push 必须被视为 forbidden side effect。
- 6.2 建立 version/manifest/registry/marketplace parity 和 `verifiedSurfaces` 报告模式。
- 6.3/6.4 均采用 `checks/blockers/missingEvidence/verifiedSurfaces/requiredCommands` 风格；6.5 应沿用，便于 release summary 合并。
- 6.4 证明 `blocked` / `manual-confirmation-required` 的 required checks 不能 release-ready；6.5 的 incomplete tag parity 应同样是 required non-passing evidence。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 发布前不再靠人工确认 npm `vX.Y.Z` tag 和 Claude plugin `curdx-flow--vX.Y.Z` tag 是否成对存在。 |
| Runtime Directory | `src/runtime/release/**`。 |
| Plugin Surface | 不修改 plugin metadata；报告 Claude plugin dependency release surface 与 npm release surface 的差异。 |
| Schema | 不新增 schema；复用 release check/verdict contract。若新增字段进入 release verdict schema，必须同步 schema/contract tests。 |
| Contract Test | Runtime tag parity output 必须可转为 6.1 release dry-run checks；dry-run side-effect detector 必须覆盖真实 tag/push 命令。 |
| Runtime Test | `tests/runtime/release/tag-parity.test.ts`。 |
| Adapter Test | 不调用真实 git remote；fixture 模拟 tag 查询结果。真实 release 前再用只读 `git ls-remote --tags` 命令。 |
| Fixture | `tests/fixtures/release-candidate/tag-parity-fixtures.json`。 |
| Evidence Output | npm tag state、Claude plugin tag state、tag parity state、safe recovery guidance、read-only commands。 |
| Report Surface | version、npm tag、Claude plugin tag、remote tag state、incomplete/mismatch blocker、next actions。 |
| Failure Mode | no tags、npm-only、plugin-only、both existing、version/tag mismatch、forbidden dry-run side effect。 |
| Verification Commands | `npm run test:release`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- 不执行真实 `git tag`、`git push`、`npm publish`、`claude plugin tag --push`；6.5 只读 evidence。
- 只读 remote tag 查询建议使用 `git ls-remote --tags origin "vX.Y.Z"` 和 `git ls-remote --tags origin "curdx-flow--vX.Y.Z"`。
- 两个 tag 都不存在可以表示“尚未发布当前版本”，不等于 partial release；只有一个存在必须视为 incomplete/blocked。
- 两个 tag 都存在通常表示当前版本已发布或 release surfaces 已成对；后续 6.6 决定是否允许真实发布动作和授权边界。
- Claude plugin dependency resolution 依赖 `{plugin-name}--v{version}` tag；npm `vX.Y.Z` 不会替代 plugin tag。

### Latest Claude Code Context

- Official Claude Code docs were checked on 2026-05-17 from `https://code.claude.com/docs/llms.txt` and `https://code.claude.com/docs/en/plugin-dependencies.md`.
- Current dependency docs state plugin release tags use `{plugin-name}--v{version}`; `claude plugin tag` derives the tag from plugin manifest and marketplace entry, validates plugin contents/version parity, requires a clean plugin working tree, refuses duplicate tags, and supports `--dry-run`.
- Current dependency docs state version constraints resolve against git tags with the plugin-name prefix, and missing matching plugin tags can disable dependency resolution.

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/release/types.ts`
- `src/runtime/release/index.ts`

**NEW expected:**

- `src/runtime/release/tag-parity.ts`
- `tests/runtime/release/tag-parity.test.ts`
- `tests/fixtures/release-candidate/tag-parity-fixtures.json`

**Read-only context:**

- `src/runtime/release/dry-run.ts`
- `src/runtime/release/parity.ts`
- `src/runtime/release/plugin-smoke.ts`
- `src/runtime/release/summary.ts`
- `tests/runtime/release/release-dry-run.test.ts`
- `tests/runtime/release/release-parity.test.ts`
- `tests/runtime/release/plugin-smoke.test.ts`
- `scripts/check-versions.mjs`
- `scripts/bump-version.mjs`
- `_bmad-output/implementation-artifacts/6-1-release-evidence-model-dry-run-verdict.md`
- `_bmad-output/implementation-artifacts/6-2-version-manifest-registry-marketplace-parity.md`
- `_bmad-output/implementation-artifacts/6-4-claude-plugin-validation-installed-smoke-evidence.md`

## References

- `_bmad-output/planning-artifacts/epics.md#Story 6.5`
- `_bmad-output/planning-artifacts/prd.md#FR57`
- `_bmad-output/planning-artifacts/prd.md#FR59`
- `_bmad-output/planning-artifacts/prd.md#NFR28`
- `_bmad-output/planning-artifacts/architecture.md#Release-Boundary`
- `_bmad-output/planning-artifacts/architecture.md#IP-REL-002`
- `_bmad-output/implementation-artifacts/6-1-release-evidence-model-dry-run-verdict.md`
- `_bmad-output/implementation-artifacts/6-2-version-manifest-registry-marketplace-parity.md`
- `https://code.claude.com/docs/llms.txt`
- `https://code.claude.com/docs/en/plugin-dependencies.md`

## Dev Agent Record

### Agent Model Used

GPT-5

### Debug Log References

- `npm run test:release -- tests/runtime/release/tag-parity.test.ts`：红测先失败于缺少 `evaluateReleaseTagParity()`；实现后通过；5 files / 35 tests。
- `npm run typecheck`：通过。
- `npm run test:release`：通过；5 files / 35 tests。
- `npm run verify`：通过；包含 release tag parity tests、release dry-run tests、version parity、hook freshness、build、hook/analyze/runner gates。

### Completion Notes List

- 新增 `evaluateReleaseTagParity()`，从 version/plugin name 计算 npm tag `vX.Y.Z` 和 Claude plugin tag `{plugin-name}--v{version}`。
- Tag parity gate 消费只读 remote tag evidence，输出 `none`、`npm-only`、`plugin-only`、`both`、`mismatch` state。
- `npm-only` / `plugin-only` 返回 `incomplete` 并阻塞 dry-run release-ready；tag identity mismatch 返回 `failed`。
- Guidance 明确 npm release surface 与 Claude plugin dependency surface 的差异，并说明 Claude plugin dependency resolution 依赖 `{plugin-name}--v{version}` tag。
- Dry-run side-effect guard 复用 6.1 detector，阻塞真实 `git tag`、`git push`、`npm publish`、`claude plugin tag --push`，runtime gate 本身不执行任何 git/claude/npm 命令。

### File List

- `src/runtime/release/types.ts`
- `src/runtime/release/tag-parity.ts`
- `src/runtime/release/index.ts`
- `tests/runtime/release/tag-parity.test.ts`
- `tests/fixtures/release-candidate/tag-parity-fixtures.json`
- `_bmad-output/implementation-artifacts/6-5-npm-tag-claude-plugin-tag-parity.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented npm/Claude plugin tag parity release gate with fixtures and release tests.
- 2026-05-17: Completed full validation and AI review.

## Senior Developer Review (AI)

### Review Date

2026-05-17

### Review Outcome

Approve

### Findings

- No blocking issues found. The evaluator is pure/evidence-only and does not query remotes or create tags.
- Dry-run side-effect detection reuses the existing 6.1 release boundary, so `git tag`, `git push`, `npm publish`, and `claude plugin tag --push` are still forbidden.
- The no-tag state is treated as ready for paired future release, while single-sided remote tag state is `incomplete` and blocks dry-run release-ready.

### Action Items

- [x] Verify no tag, npm-only, plugin-only, both tags, tag mismatch, and forbidden side-effect fixtures.
- [x] Verify tag parity output can feed `evaluateReleaseDryRun()`.
- [x] Verify full `npm run verify` passes.

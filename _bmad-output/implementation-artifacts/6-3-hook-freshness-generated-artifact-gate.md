# Story 6.3: Hook Freshness and Generated Artifact Gate

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为维护 curdx-flow hooks 的开发者，
我希望 release gate 能验证 hook TypeScript source 与 committed generated hook bundles 一致，
以便发布的插件不会运行过期、手改或未构建的 hook 脚本。

## Acceptance Criteria

1. **Hook freshness required checks：** 给定 release gate 检查 hook freshness，当 `src/hooks/**`、`scripts/build-hooks.mjs` 或 `plugins/curdx-flow/hooks/hooks.json` 发生变化，必须要求 `npm run build:hooks` 和 `npm run check:hooks-fresh` 通过；generated bundles 必须与 source 变更对应。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.3`; `_bmad-output/planning-artifacts/prd.md#FR55`; `_bmad-output/planning-artifacts/prd.md#NFR26`; `_bmad-output/planning-artifacts/prd.md#NFR27`]
2. **Manual bundle edit blocker：** 给定 generated hook bundle 被手动修改但 source 未改，当 freshness check 执行，release verdict 必须为 `not-releasable`；blocker 必须说明不得手改 `plugins/curdx-flow/hooks/scripts/**`。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.3`; `_bmad-output/planning-artifacts/architecture.md#Release Boundary`]
3. **Hook entrypoint surface parity：** 给定 hook entrypoint 增删或路径变更，当 release gate 检查 hook surfaces，必须验证 `scripts/build-hooks.mjs` entries、`plugins/curdx-flow/hooks/hooks.json`、generated scripts、plugin manifest 或 smoke coverage 是否同步；任一不一致必须阻塞发布。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.3`; `_bmad-output/planning-artifacts/prd.md#NFR26`]
4. **Hook protocol test evidence：** 给定 hook stdout/stderr 或 gate 行为发生变化，当 release gate 汇总验证结果，必须要求相关 hook protocol tests 通过；report 必须列出 hook freshness、hook tests 和 generated artifact 状态。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.3`; `_bmad-output/planning-artifacts/architecture.md#Hook Runtime Contracts`]
5. **Plugin validation/smoke evidence still required：** 给定 hook freshness 通过但 plugin validation 未运行，当 release gate 判断发布 readiness，release verdict 仍不得为 release-ready；必须列出缺少 Claude plugin validation 或 installed smoke evidence。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.3`; `_bmad-output/planning-artifacts/prd.md#NFR27`]
6. **验证覆盖：** 给定 Story 6.3 完成，当执行验证，最小验证命令必须包含 `npm run build:hooks`、`npm run check:hooks-fresh`、相关 `npm run test:hooks`、release hook gate tests；测试必须覆盖 stale generated bundle、manual bundle edit、missing hook entry、hooks.json mismatch、hook protocol test missing。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.3`]

## Tasks / Subtasks

- [x] 定义 hook freshness release contract（AC: 1-6）
  - [x] 在 `src/runtime/release/types.ts` 增加 hook entry、hook surface、generated artifact、hook freshness report 类型。
  - [x] 新增 `src/runtime/release/hook-freshness.ts`，导出 `evaluateHookFreshnessGate()` 或等价函数。
  - [x] 输出必须可作为 6.1 `evaluateReleaseDryRun()` 的 check input，并包含 checks、blockers、missingEvidence、verifiedSurfaces、requiredCommands。

- [x] 实现 generated artifact freshness 判定（AC: 1,2）
  - [x] source changed + generated bundle stale 必须阻塞。
  - [x] generated changed + source unchanged 必须判定为 manual bundle edit blocker。
  - [x] `npm run build:hooks` 和 `npm run check:hooks-fresh` 必须作为 required command evidence。

- [x] 实现 hook entrypoint parity（AC: 3）
  - [x] 比对 build entries、`hooks.json` command targets、generated scripts 是否一致。
  - [x] `hooks.json` 指向的 `${CLAUDE_PLUGIN_ROOT}/hooks/scripts/*.mjs` 必须存在于 generated scripts。
  - [x] build entry 增删、hooks.json mismatch、missing generated script 必须阻塞。

- [x] 实现 hook protocol evidence gate（AC: 4,5）
  - [x] hook behavior touched 时必须要求 `npm run test:hooks` evidence。
  - [x] hook freshness passed 不能代替 `claude plugin validate` 或 installed smoke；缺少时输出 missingEvidence/blocker。
  - [x] report/check summary 必须列出 hook freshness、hook tests、plugin validation、installed smoke 状态。

- [x] 增加 release hook fixtures/tests（AC: 1-6）
  - [x] 新增 `tests/runtime/release/hook-freshness.test.ts`。
  - [x] 新增 `tests/fixtures/release-candidate/hook-freshness-fixtures.json` 或等价 fixture。
  - [x] 覆盖 stale generated bundle、manual bundle edit、missing hook entry、hooks.json mismatch、hook protocol test missing、happy path。
  - [x] 保持 `npm run test:release` 和 `npm run verify` 覆盖 hook freshness tests。

- [x] 验证和记录（AC: 6）
  - [x] 运行 `npm run build:hooks`。
  - [x] 运行 `npm run check:hooks-fresh`。
  - [x] 运行 `npm run test:hooks`。
  - [x] 运行 `npm run test:release`。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

## Dev Notes

### 当前发现

- `scripts/build-hooks.mjs` 的 `HOOK_ENTRIES` 是 canonical source entry list，输出到 `plugins/curdx-flow/hooks/scripts`。
- `scripts/check-hooks-fresh.mjs` 会 hash generated hook scripts，运行 `node scripts/build-hooks.mjs`，再比较 hash；漂移时提示运行 `npm run build:hooks`。
- `plugins/curdx-flow/hooks/hooks.json` 以 `${CLAUDE_PLUGIN_ROOT}/hooks/scripts/*.mjs` 指向 installed plugin runtime scripts。
- `tests/hooks/hook-boundary.test.ts` 已覆盖 hook stdout/stderr、fail-open、Stop/TaskCompleted 等 protocol 行为。

### Previous Story Intelligence

- 6.1 建立 release dry-run verdict 和 no side-effect 边界；6.3 只产生 release checks，不执行真实 release。
- 6.2 建立 parity check 模式；6.3 应沿用 `checks/blockers/verifiedSurfaces/guidance` 风格，便于后续汇总。
- 6.1 review 已发现新测试必须接入 `npm run verify`；6.3 使用现有 `npm run test:release`，无需新增 verify 脚本。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 发布前不再靠人工确认 hooks 是否构建、是否被手改、hooks.json 是否指向存在的 generated script。 |
| Runtime Directory | `src/runtime/release/**`。 |
| Plugin Surface | 读取 `plugins/curdx-flow/hooks/hooks.json` 和 generated scripts；默认不修改 hook metadata。 |
| Schema | 不新增 schema；复用 release check/verdict contract。 |
| Contract Test | Runtime hook freshness output 必须可转为 release check；schema 由 release verdict contract 覆盖。 |
| Runtime Test | `tests/runtime/release/hook-freshness.test.ts`。 |
| Adapter Test | 不调用真实 build/check 命令；fixture 模拟 command evidence 和 file surface 状态。 |
| Fixture | `tests/fixtures/release-candidate/hook-freshness-fixtures.json`。 |
| Evidence Output | hook freshness check、hook protocol test check、plugin validation/smoke missing evidence。 |
| Report Surface | hook freshness、generated bundle、hooks.json target、hook protocol tests、plugin validation/smoke status。 |
| Failure Mode | stale generated bundle、manual bundle edit、missing hook entry、hooks.json mismatch、hook protocol test missing。 |
| Verification Commands | `npm run build:hooks`, `npm run check:hooks-fresh`, `npm run test:hooks`, `npm run test:release`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- 不手改 `plugins/curdx-flow/hooks/scripts/**`；改 `src/hooks/**` 后用 `npm run build:hooks`。
- Hook stdout 是协议通道，不能用 debug 文本污染。
- Hook freshness 不能代替 plugin validation 或 installed smoke。
- Runtime check 不执行真实 build；只消费命令 evidence/file surface state。真实命令由验证步骤和脚本承担。

### Latest Claude Code Context

- Official Claude Code docs were checked on 2026-05-17 from `https://code.claude.com/docs/llms.txt`, `https://code.claude.com/docs/en/plugins-reference.md`, `https://code.claude.com/docs/en/hooks.md`, and `https://code.claude.com/docs/en/plugins.md`.
- Current docs state plugin hooks can be defined in `hooks/hooks.json` at plugin root, and installed plugin paths must use `${CLAUDE_PLUGIN_ROOT}` for plugin-local files.
- Current docs state plugin validation checks `plugin.json`, skill/agent/command frontmatter, and `hooks/hooks.json`; 6.3 freshness is necessary but not sufficient for release-ready.

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/release/types.ts`
- `src/runtime/release/index.ts`

**NEW expected:**

- `src/runtime/release/hook-freshness.ts`
- `tests/runtime/release/hook-freshness.test.ts`
- `tests/fixtures/release-candidate/hook-freshness-fixtures.json`

**Read-only context:**

- `scripts/build-hooks.mjs`
- `scripts/check-hooks-fresh.mjs`
- `plugins/curdx-flow/hooks/hooks.json`
- `src/hooks/**/*.ts`
- `plugins/curdx-flow/hooks/scripts/**/*.mjs`
- `tests/hooks/hook-boundary.test.ts`
- `_bmad-output/implementation-artifacts/6-1-release-evidence-model-dry-run-verdict.md`
- `_bmad-output/implementation-artifacts/6-2-version-manifest-registry-marketplace-parity.md`

## References

- `_bmad-output/planning-artifacts/epics.md#Story 6.3`
- `_bmad-output/planning-artifacts/prd.md#FR55`
- `_bmad-output/planning-artifacts/prd.md#NFR26`
- `_bmad-output/planning-artifacts/prd.md#NFR27`
- `_bmad-output/planning-artifacts/architecture.md#Release Boundary`
- `_bmad-output/implementation-artifacts/6-1-release-evidence-model-dry-run-verdict.md`
- `_bmad-output/implementation-artifacts/6-2-version-manifest-registry-marketplace-parity.md`
- `https://code.claude.com/docs/llms.txt`
- `https://code.claude.com/docs/en/plugins-reference.md`
- `https://code.claude.com/docs/en/hooks.md`

## Dev Agent Record

### Agent Model Used

GPT-5

### Debug Log References

- `npm run test:release -- tests/runtime/release/hook-freshness.test.ts`：先红测确认 hook surface kind 语义问题，再绿测通过；3 files / 20 tests。
- `npm run typecheck`：通过。
- `npm run test:release`：通过；3 files / 20 tests。
- `npm run build:hooks`：通过；bundled 37 entrypoint(s)。
- `npm run check:hooks-fresh`：通过；bundles match source。
- `npm run test:hooks`：通过；1 file / 10 tests。
- `npm run verify`：通过；包含 release tests、hook freshness、build、bundle、hook/analyze/runner gates。
- `claude plugin validate ./plugins/curdx-flow`：通过。

### Completion Notes List

- 新增 `evaluateHookFreshnessGate()`，输出 release dry-run 可消费的 checks、blockers、missingEvidence、verifiedSurfaces、requiredCommands。
- Hook freshness gate 会阻塞 source/build/hooks metadata 变更后的 stale generated bundle，并阻塞 source 未变但 `plugins/curdx-flow/hooks/scripts/**` 被手改的 manual bundle edit。
- Hook entrypoint parity 覆盖 build entries、`hooks.json` `${CLAUDE_PLUGIN_ROOT}/hooks/scripts/*.mjs` targets、generated scripts；允许 build 生成但未被 `hooks.json` 引用的辅助脚本。
- Hook protocol evidence 在 hook behavior touched 时要求 `npm run test:hooks`；hook freshness 不能替代 Claude plugin validation 或 installed smoke evidence。
- Senior review 修复了 `verifiedSurfaces.kind` 复用 `version` / `marketplace` 的语义问题，现在明确输出 `hook-build-entry`、`hook-config-target`、`generated-hook-script`。

### File List

- `src/runtime/release/types.ts`
- `src/runtime/release/hook-freshness.ts`
- `src/runtime/release/index.ts`
- `tests/runtime/release/hook-freshness.test.ts`
- `tests/fixtures/release-candidate/hook-freshness-fixtures.json`
- `_bmad-output/implementation-artifacts/6-3-hook-freshness-generated-artifact-gate.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented hook freshness release gate, entrypoint parity, command evidence checks, fixtures, and release tests.
- 2026-05-17: Addressed senior review finding for hook verified surface kind semantics and completed full validation.

## Senior Developer Review (AI)

### Review Date

2026-05-17

### Review Outcome

Approve

### Findings

- Resolved before completion: `verifiedSurfaces.kind` originally reused `version` and `marketplace` from release parity. Added explicit hook surface kinds and test coverage for build entry, hooks.json target, and generated script report surfaces.

### Action Items

- [x] Add hook-specific verified surface kinds instead of reusing release parity surface kinds.
- [x] Include generated hook scripts in `verifiedSurfaces`.
- [x] Re-run release, hook, typecheck, full verify, and Claude plugin validation gates.

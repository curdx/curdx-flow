# Story 6.4: Claude Plugin Validation and Installed Smoke Evidence

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为准备发布 curdx-flow 插件的维护者，
我希望 release gate 验证源码态 plugin 结构和安装态 smoke，
以便发布信心来自真实 Claude Code 插件加载与运行路径，而不只是 repo 内 TypeScript 测试通过。

## Acceptance Criteria

1. **Claude plugin validation evidence：** 给定 release gate 执行 plugin validation，当检查 `plugins/curdx-flow`，必须运行或要求运行 `claude plugin validate ./plugins/curdx-flow`；validation failure 必须生成 `not-releasable` blocker，包含失败摘要和修复路径。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.4`; `_bmad-output/planning-artifacts/prd.md#FR53`; `_bmad-output/planning-artifacts/prd.md#FR59`; `https://code.claude.com/docs/en/plugins-reference.md`]
2. **Plugin surface changes require validation：** 给定 plugin manifest、skills、agents、hooks、schemas、templates、references 或 bin surface 发生变化，当 release readiness 被评估，必须要求 Claude plugin validation evidence；不能只用 `npm run build` 或 `npm run typecheck` 代替。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.4`; `_bmad-output/planning-artifacts/prd.md#NFR27`; `_bmad-output/project-context.md#Claude Code Plugin`]
3. **Installed smoke in isolated workspace：** 给定 installed-plugin smoke 执行，当 `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc` 或等价 smoke 运行，必须在隔离 temp workspace 中验证 plugin 可安装/加载、主命令 surface 可访问、hook 不阻塞 Claude Code、依赖缺失时输出 actionable guidance；不得在仓库工作区创建真实用户 specs/state。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.4`; `_bmad-output/planning-artifacts/prd.md#FR56`; `scripts/claudecc-smoke.mjs`]
4. **Smoke failure classification：** 给定 smoke 发现插件依赖、external MCP、hook、slash command 或 bin runtime 问题，当 release report 生成，release verdict 必须为 `not-releasable`；blocker 必须说明失败发生在源码态 validation、安装态 smoke、dependency resolution 还是 runtime command。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.4`; `_bmad-output/planning-artifacts/architecture.md#Release and Verification Patterns`]
5. **Claude CLI unavailable/unsupported handling：** 给定本机 Claude CLI 缺失或版本不支持某项 smoke，当 release gate 运行，必须输出 blocked 或 manual-confirmation-required；不能把未运行 smoke 当作通过。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.4`; `_bmad-output/planning-artifacts/prd.md#NFR20`; `https://code.claude.com/docs/en/plugins.md`]
6. **验证覆盖：** 给定 Story 6.4 完成，当执行验证，最小验证命令必须包含 `claude plugin validate ./plugins/curdx-flow`、`CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc` 或可测试替身，以及 release smoke tests；测试必须覆盖 validation pass/fail、installed smoke pass/fail、dependency guidance、hooks non-blocking、isolated temp workspace。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.4`]

## Tasks / Subtasks

- [x] 定义 plugin validation / installed smoke release contract（AC: 1-6）
  - [x] 在 `src/runtime/release/types.ts` 增加 plugin surface change、Claude CLI readiness、installed smoke surface、smoke finding、plugin smoke result 类型。
  - [x] 新增 `src/runtime/release/plugin-smoke.ts`，导出 `evaluatePluginSmokeGate()` 或等价函数。
  - [x] 输出必须可作为 6.1 `evaluateReleaseDryRun()` 的 check input，并包含 checks、blockers、missingEvidence、verifiedSurfaces、requiredCommands。

- [x] 实现 Claude plugin validation evidence gate（AC: 1,2）
  - [x] `claude plugin validate ./plugins/curdx-flow` missing 或 failed 必须阻塞 release。
  - [x] plugin manifest/skills/agents/hooks/schemas/templates/references/bin surface touched 时必须要求 validation evidence。
  - [x] blocker 必须包含 validation failure 摘要和修复路径，不能接受 `npm run build` 或 `npm run typecheck` 作为替代 evidence。

- [x] 实现 installed-plugin smoke gate（AC: 3,4）
  - [x] `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc` missing 或 failed 必须阻塞 release。
  - [x] smoke surface 必须表达 plugin load、slash command、hook non-blocking、dependency guidance、runtime bin、isolated workspace。
  - [x] 失败必须按源码态 validation、安装态 smoke、dependency resolution、runtime command 或 hook 分类到 blocker。
  - [x] repo workspace mutation 或非隔离 workspace 必须阻塞 release。

- [x] 实现 Claude CLI unavailable/unsupported 分支（AC: 5）
  - [x] Claude CLI missing 时输出 blocked/manual-confirmation-required check，而不是 passed。
  - [x] Claude CLI 版本不支持 smoke 所需能力时输出 manual confirmation guidance。
  - [x] missing/unsupported 不得被 `evaluateReleaseDryRun()` 评估为 `release-ready`。

- [x] 增加 release smoke fixtures/tests（AC: 1-6）
  - [x] 新增 `tests/runtime/release/plugin-smoke.test.ts`。
  - [x] 新增 `tests/fixtures/release-candidate/plugin-smoke-fixtures.json` 或等价 fixture。
  - [x] 覆盖 validation pass/fail、installed smoke pass/fail、dependency guidance、hooks non-blocking、isolated temp workspace、Claude CLI missing/unsupported。
  - [x] 保持 `npm run test:release` 和 `npm run verify` 覆盖 plugin smoke tests。

- [x] 验证和记录（AC: 6）
  - [x] 运行 `claude plugin validate ./plugins/curdx-flow`。
  - [x] 运行 `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`，如果本机不可用，必须记录可测试替身和 blocker/manual-confirmation 语义。
  - [x] 运行 `npm run test:release`。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

## Dev Notes

### 当前发现

- `scripts/claudecc-smoke.mjs` 已在 temp directory 中运行 `claude --plugin-dir <pluginRoot> -p /curdx-flow:help`、`/curdx-flow:status`，并通过 plugin-local `bin/curdx-flow` 验证 doctor、snapshot、route、compile route 和 split workspace route。
- `scripts/claudecc-smoke.mjs` 已避免在 repo 工作区创建真实用户 specs/state：slash command smoke 的 cwd 是 `mkdtempSync(...)` 创建的 temp dir，compile/split fixtures 也在 temp tree 内创建并清理。
- 当前 `npm run verify` 不包含 `npm run test:claudecc`；6.4 release gate 必须显式要求 installed smoke evidence，不能依赖 verify 间接覆盖。
- 6.3 已经把 hook freshness passed 与 plugin validation/smoke missing 区分开；6.4 应补全 validation/smoke 的独立 evidence contract，而不是改写 6.3 gate。

### Previous Story Intelligence

- 6.1 建立 `evaluateReleaseDryRun()`：只要 required checks 不是 passed，dry-run verdict 必须为 `not-releasable`，且真实 push/tag/publish side effects 被阻断。
- 6.2 建立 `verifiedSurfaces` 模式：release report 应明确记录验证过哪些版本、dependency、marketplace 或外部能力 surface。
- 6.3 建立 `evaluateHookFreshnessGate()`：release gate 输出 checks、blockers、missingEvidence、verifiedSurfaces、requiredCommands，并在 dry-run 中证明 missing plugin validation/smoke 不能 release-ready。
- 6.3 senior review 修复了 surface kind 语义；6.4 不要复用不准确 kind，需使用 plugin/smoke 语义清晰的 surface kind。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 发布前不再靠人工确认 Claude plugin validate、installed smoke、dependency guidance、hook non-blocking 和 temp workspace safety。 |
| Runtime Directory | `src/runtime/release/**`。 |
| Plugin Surface | 读取/验证 `plugins/curdx-flow/.claude-plugin/plugin.json`、`plugins/curdx-flow/hooks/hooks.json`、skills/agents/hooks/schemas/templates/references/bin；默认不修改 plugin metadata。 |
| Schema | 不新增 schema；复用 release check/verdict contract。若新增字段进入 release verdict schema，必须同步 `release-verdict.schema.json` 和 contract tests。 |
| Contract Test | Runtime output 必须可转为 6.1 release dry-run checks；schema 由 release verdict contract 覆盖。 |
| Runtime Test | `tests/runtime/release/plugin-smoke.test.ts`。 |
| Adapter Test | 不调用真实 Claude CLI；fixture 模拟 validation/smoke/CLI readiness evidence。真实 CLI 由验证命令承担。 |
| Fixture | `tests/fixtures/release-candidate/plugin-smoke-fixtures.json`。 |
| Evidence Output | plugin validation check、installed smoke check、dependency guidance surface、hook non-blocking surface、isolated workspace surface。 |
| Report Surface | source validation、installed smoke、Claude CLI readiness、dependency guidance、hook non-blocking、runtime command、workspace isolation 状态。 |
| Failure Mode | validation failed、smoke failed、dependency guidance missing、hook blocking、repo workspace mutation、Claude CLI missing/unsupported。 |
| Verification Commands | `claude plugin validate ./plugins/curdx-flow`, `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`, `npm run test:release`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- Release gate 不执行真实 release，不 push/tag/publish，不调用 `claude plugin tag --push`。
- Runtime check 不直接调用 Claude CLI；它消费 command evidence 和 smoke surface evidence。真实 CLI 行为由 `claude plugin validate` 和 `scripts/claudecc-smoke.mjs` 验证。
- Installed smoke 必须使用 temp workspace；任何 repo-root specs/state 写入都应被视为 blocker。
- Plugin validation/smoke 是 release evidence，不可由 build/typecheck/hook freshness 替代。
- Dependency guidance 要区分 plugin dependencies 与 external MCP：前者走 Claude plugin dependency/marketplace 语义，后者只做 readiness/degradation，不建模成 plugin dependency。

### Latest Claude Code Context

- Official Claude Code docs were checked on 2026-05-17 from `https://code.claude.com/docs/llms.txt`, `https://code.claude.com/docs/en/plugins.md`, `https://code.claude.com/docs/en/plugins-reference.md`, and `https://code.claude.com/docs/en/plugin-dependencies.md`.
- Current docs state local plugin testing uses `claude --plugin-dir ./my-plugin`; when changes are made, `/reload-plugins` reloads plugins, skills, agents, hooks, MCP servers, and LSP servers.
- Current docs state plugin hooks live at `hooks/hooks.json` in plugin root or inline in `plugin.json`; plugin-local paths should use `${CLAUDE_PLUGIN_ROOT}`.
- Current docs state `claude plugin validate` or `/plugin validate` checks `plugin.json`, skill/agent/command frontmatter, and `hooks/hooks.json` syntax/schema errors.
- Current dependency docs state plugin dependencies in `plugin.json` can auto-resolve, cross-marketplace dependencies require the root marketplace `allowCrossMarketplaceDependenciesOn`, and dependency errors surface in `claude plugin list`, `/plugin`, and `/doctor`.

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/release/types.ts`
- `src/runtime/release/index.ts`

**NEW expected:**

- `src/runtime/release/plugin-smoke.ts`
- `tests/runtime/release/plugin-smoke.test.ts`
- `tests/fixtures/release-candidate/plugin-smoke-fixtures.json`

**Read-only context:**

- `src/runtime/release/dry-run.ts`
- `src/runtime/release/hook-freshness.ts`
- `src/runtime/release/parity.ts`
- `tests/runtime/release/release-dry-run.test.ts`
- `tests/runtime/release/release-parity.test.ts`
- `tests/runtime/release/hook-freshness.test.ts`
- `scripts/claudecc-smoke.mjs`
- `plugins/curdx-flow/.claude-plugin/plugin.json`
- `plugins/curdx-flow/hooks/hooks.json`
- `package.json`
- `_bmad-output/implementation-artifacts/6-1-release-evidence-model-dry-run-verdict.md`
- `_bmad-output/implementation-artifacts/6-2-version-manifest-registry-marketplace-parity.md`
- `_bmad-output/implementation-artifacts/6-3-hook-freshness-generated-artifact-gate.md`

## References

- `_bmad-output/planning-artifacts/epics.md#Story 6.4`
- `_bmad-output/planning-artifacts/prd.md#FR53`
- `_bmad-output/planning-artifacts/prd.md#FR56`
- `_bmad-output/planning-artifacts/prd.md#FR59`
- `_bmad-output/planning-artifacts/prd.md#NFR20`
- `_bmad-output/planning-artifacts/prd.md#NFR27`
- `_bmad-output/planning-artifacts/architecture.md#Release and Verification Patterns`
- `_bmad-output/planning-artifacts/architecture.md#FR53-FR59-FR76-FR77-Release-Gate`
- `_bmad-output/implementation-artifacts/6-1-release-evidence-model-dry-run-verdict.md`
- `_bmad-output/implementation-artifacts/6-2-version-manifest-registry-marketplace-parity.md`
- `_bmad-output/implementation-artifacts/6-3-hook-freshness-generated-artifact-gate.md`
- `https://code.claude.com/docs/llms.txt`
- `https://code.claude.com/docs/en/plugins.md`
- `https://code.claude.com/docs/en/plugins-reference.md`
- `https://code.claude.com/docs/en/plugin-dependencies.md`

## Dev Agent Record

### Agent Model Used

GPT-5

### Debug Log References

- `npm run test:release -- tests/runtime/release/plugin-smoke.test.ts`：红测先失败于缺少 `evaluatePluginSmokeGate()`；实现后通过；4 files / 29 tests。
- `npm run typecheck`：通过。
- `npm run test:release`：通过；4 files / 29 tests。
- `claude plugin validate ./plugins/curdx-flow`：通过。
- `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`：通过；Claude Code 2.1.143，完成 plugin validate、`--plugin-dir` help/status、runtime doctor/snapshot/route/compile/split smoke。
- `npm run verify`：通过；包含 typecheck、runtime suites、release tests、version parity、hook freshness、build、bundle、hook/analyze/runner gates。

### Completion Notes List

- 新增 `evaluatePluginSmokeGate()`，输出 release dry-run 可消费的 checks、blockers、missingEvidence、verifiedSurfaces、requiredCommands。
- Claude plugin validation evidence missing/failed 会阻塞 release，并以 `source-validation` 分类；`npm run build` / `npm run typecheck` 不会被接受为替代 evidence。
- Installed smoke evidence missing/failed 会阻塞 release；smoke surfaces 覆盖 plugin load、slash command、hook non-blocking、dependency guidance、runtime bin、isolated workspace。
- Smoke blockers 会按 `source-validation`、`installed-smoke`、`dependency-resolution`、`runtime-command`、`hook`、`workspace-isolation`、`claude-cli` 分类，便于 release report 给出修复路径。
- Claude CLI missing 输出 `blocked`；Claude CLI 不支持 validation 或 `--plugin-dir` smoke 输出 `manual-confirmation-required`，两者都不能被 dry-run 评估为 `release-ready`。

### File List

- `src/runtime/release/types.ts`
- `src/runtime/release/plugin-smoke.ts`
- `src/runtime/release/index.ts`
- `tests/runtime/release/plugin-smoke.test.ts`
- `tests/fixtures/release-candidate/plugin-smoke-fixtures.json`
- `_bmad-output/implementation-artifacts/6-4-claude-plugin-validation-installed-smoke-evidence.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented Claude plugin validation and installed smoke release gate with fixtures and release tests.
- 2026-05-17: Completed full validation, real Claude plugin validation, and installed smoke evidence.

## Senior Developer Review (AI)

### Review Date

2026-05-17

### Review Outcome

Approve

### Findings

- No blocking issues found. The runtime gate consumes evidence instead of invoking Claude CLI directly, so release dry-run remains side-effect free.
- `blocked` and `manual-confirmation-required` checks remain required non-passing checks for `evaluateReleaseDryRun()`, so Claude CLI unavailable/unsupported paths cannot accidentally become `release-ready`.
- Real installed smoke was executed separately with Claude Code 2.1.143 and temp workspaces; fixture tests cover the failure classes required by the story.

### Action Items

- [x] Verify `blocked` / `manual-confirmation-required` check statuses produce `not-releasable` dry-run verdicts.
- [x] Verify real `claude plugin validate ./plugins/curdx-flow` evidence.
- [x] Verify real `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc` installed smoke evidence.

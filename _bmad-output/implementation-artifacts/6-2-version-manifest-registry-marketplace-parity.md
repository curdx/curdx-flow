# Story 6.2: Version, Manifest, Registry and Marketplace Parity Checks

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为准备发布 curdx-flow 的维护者，
我希望 release gate 检查 package version、plugin manifest、registry、marketplace trust 和 dependency declarations 是否一致，
以便避免 npm 包、Claude plugin、依赖解析和安装态行为发生漂移。

## Acceptance Criteria

1. **Version surface parity：** 给定 release gate 读取版本和元数据，当 parity check 执行，必须检查 `package.json`、`package-lock.json` root、`package-lock.json packages[""]`、`plugins/curdx-flow/.claude-plugin/plugin.json`、repo-root `.claude-plugin/marketplace.json` 的版本一致性；任一字段不一致必须生成 `not-releasable` blocker。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.2`; `_bmad-output/planning-artifacts/prd.md#FR54`; `_bmad-output/planning-artifacts/prd.md#FR57`; `_bmad-output/planning-artifacts/prd.md#FR59`; `_bmad-output/planning-artifacts/prd.md#NFR18`]
2. **Plugin dependency identity parity：** 给定 plugin dependencies 被声明，当 dependency parity check 执行，必须检查 plugin manifest dependencies、`src/registry/capabilities.ts`、`src/registry/plugins/*`、marketplace allowlist、runner tests 所需的依赖身份一致；`pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max` 的 marketplace/plugin id 漂移必须阻塞发布。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.2`; `_bmad-output/planning-artifacts/prd.md#FR54`; `_bmad-output/planning-artifacts/prd.md#FR58`; `_bmad-output/planning-artifacts/prd.md#NFR18`; `_bmad-output/planning-artifacts/prd.md#NFR26`]
3. **External MCP boundary：** 给定 expected external MCP 被配置或检测，当 release gate 检查 external capability boundary，`context7` 和 `sequential-thinking` 不得作为 plugin dependencies 发布；release report 必须说明它们属于 expected external MCP readiness，而不是 plugin dependency resolution。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.2`; `_bmad-output/planning-artifacts/prd.md#FR46`; `_bmad-output/planning-artifacts/prd.md#NFR19`]
4. **Version bump guidance：** 给定版本需要变更，当维护者尝试手动改多个版本文件，release guidance 必须要求使用 `node scripts/bump-version.mjs <version|patch|minor|major>`；手动漂移状态必须被 parity check 捕获。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.2`; `_bmad-output/planning-artifacts/prd.md#FR54`; `_bmad-output/planning-artifacts/architecture.md#IP-NAME-001`]
5. **Evidence/report surfaces：** 给定 parity check 通过，当 report 输出，release evidence 必须列出所有已验证 version/manifest/registry/marketplace surfaces，并记录对应命令或检查来源。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.2`; `_bmad-output/planning-artifacts/architecture.md#IP-REL-002`; `_bmad-output/planning-artifacts/architecture.md#IP-REL-003`]
6. **验证覆盖：** 给定 Story 6.2 完成，当执行验证，最小验证命令必须包含 `npm run check-versions`、`npm run test:runner`、release parity tests；测试必须覆盖版本不一致、依赖 id 漂移、marketplace allowlist 缺失、external MCP 误建模、版本脚本 guidance。[Source: `_bmad-output/planning-artifacts/epics.md#Story 6.2`]

## Tasks / Subtasks

- [x] 定义 release parity contract（AC: 1-6）
  - [x] 在 `src/runtime/release/types.ts` 增加 version surface、dependency surface、external MCP boundary、parity report/check 类型。
  - [x] 新增 `src/runtime/release/parity.ts`，导出 `evaluateReleaseParity()` 或等价函数。
  - [x] 输出必须可作为 6.1 `evaluateReleaseDryRun()` 的 check input，并包含 checks、blockers、missingEvidence、evidenceRefs、verifiedSurfaces、guidance。

- [x] 实现 version parity（AC: 1,4）
  - [x] 检查 package、lockfile root、lockfile package root、plugin manifest、marketplace entry 五个版本字段。
  - [x] 任一缺失或不一致必须输出 `not-releasable` blocker，并包含 field/path/current/expected。
  - [x] guidance 必须明确使用 `node scripts/bump-version.mjs <version|patch|minor|major>`。
  - [x] 不修改版本，不执行 bump，不 push/tag/publish。

- [x] 实现 plugin dependency parity（AC: 2）
  - [x] 比对 plugin manifest `dependencies` 与 `CURDX_PLUGIN_DEPENDENCIES` 的 name、marketplace、pluginId。
  - [x] 检查 marketplace `allowCrossMarketplaceDependenciesOn` 包含所有依赖 marketplace，且不得额外放行未知 marketplace。
  - [x] 检查 registry plugin packages 使用的 `pluginDependencySpec()` 身份与 canonical dependency spec 一致。
  - [x] 依赖 id、marketplace、plugin id、allowlist 任一漂移都必须生成 blocker。

- [x] 实现 external MCP boundary（AC: 3）
  - [x] `context7`、`sequential-thinking` 必须保留在 `CURDX_EXTERNAL_MCPS` / capability model 中。
  - [x] 若 plugin manifest dependencies 或 marketplace plugin dependencies 出现 external MCP id，必须阻塞发布。
  - [x] report/evidence 要说明 external MCP 属于 readiness capability，不属于 plugin dependency auto-resolution。

- [x] 增加 release parity fixtures/tests（AC: 1-6）
  - [x] 新增 `tests/runtime/release/release-parity.test.ts`。
  - [x] 新增 `tests/fixtures/release-candidate/release-parity-fixtures.json` 或等价 fixture。
  - [x] 覆盖版本不一致、依赖 id 漂移、marketplace allowlist 缺失、external MCP 误建模、版本脚本 guidance、happy path。
  - [x] 保持 `npm run test:release` 和 `npm run verify` 覆盖 release parity tests。

- [x] 验证和记录（AC: 6）
  - [x] 运行 `npm run check-versions`。
  - [x] 运行 `npm run test:runner`。
  - [x] 运行 `npm run test:release`。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。
  - [x] 将验证命令和结果写入本 story 的 Dev Agent Record。

## Dev Notes

### 当前发现

- 现有 `scripts/check-versions.mjs` 已检查五个版本面，但它是脚本 gate；6.2 应把同一类事实提升为 runtime release parity check，供 release verdict 聚合消费。
- `src/registry/capabilities.ts` 已有 canonical `CURDX_PLUGIN_DEPENDENCIES` 和 `CURDX_EXTERNAL_MCPS`，registry plugin files 多数通过 `pluginDependencySpec()` 派生 identity。
- `.claude-plugin/marketplace.json` 当前 allowlist 包含 `pua-skills`、`thedotmack`、`chrome-devtools-plugins`、`ui-ux-pro-max-skill`。
- `plugins/curdx-flow/.claude-plugin/plugin.json` 当前 dependencies 为 `pua@pua-skills`、`claude-mem@thedotmack`、`chrome-devtools-mcp@chrome-devtools-plugins`、`ui-ux-pro-max@ui-ux-pro-max-skill`。

### Previous Story Intelligence

- 6.1 已新增 `evaluateReleaseDryRun()` 和 release verdict schema，6.2 parity output 应尽量成为 6.1 dry-run 的 `checks` 输入，而不是另起一套 verdict。
- 6.1 review 修复了 release tests 未接主 verify 的问题；6.2 新增测试必须继续通过 `npm run test:release` 和 `npm run verify` 执行。
- 2.2/runner 相关历史已把 plugin dependencies 与 external MCP 区分开。6.2 不应把 `context7` 或 `sequential-thinking` 误塞进 plugin manifest dependencies。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 发布前不再人工猜版本、manifest、registry、marketplace trust 和 dependency identity 是否漂移。 |
| Runtime Directory | `src/runtime/release/**`。 |
| Plugin Surface | 只读取 `plugins/curdx-flow/.claude-plugin/plugin.json`、repo-root `.claude-plugin/marketplace.json`；默认不修改插件 manifest/registry identity。 |
| Schema | 不新增 schema；复用 6.1 release check/verdict contract。 |
| Contract Test | Runtime parity output 必须可转为 release check；schema 由 6.1/contract tests 覆盖。 |
| Runtime Test | `tests/runtime/release/release-parity.test.ts`。 |
| Adapter Test | 不调用真实 Claude/npm/git；使用 fixture 对象测试 parity。 |
| Fixture | `tests/fixtures/release-candidate/release-parity-fixtures.json`。 |
| Evidence Output | parity check 输出 version/dependency/external MCP surfaces 和 evidence refs，可交给 release dry-run verdict。 |
| Report Surface | version parity check、dependency trust check、external MCP boundary check、bump script guidance。 |
| Failure Mode | version mismatch、dependency id drift、allowlist missing、external MCP modeled as plugin dependency。 |
| Verification Commands | `npm run check-versions`, `npm run test:runner`, `npm run test:release`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- 不修改版本号，不自动 bump，不 push/tag/publish。
- npm tag `vX.Y.Z` 与 Claude plugin tag `curdx-flow--vX.Y.Z` 是不同发布面。
- External MCP 不得建模为 plugin dependency。
- Runtime release parity 只产生 evidence/check/blocker，不替代 `scripts/check-versions.mjs`；script 仍是可执行 gate。
- 不要把 `scripts/**` 作为唯一真相；runtime check 应消费结构化输入，tests 用 fixture 覆盖。

### Latest Claude Code Context

- Official Claude Code docs were checked on 2026-05-17 from `https://code.claude.com/docs/llms.txt`, `https://code.claude.com/docs/en/plugins-reference.md`, `https://code.claude.com/docs/en/plugin-dependencies.md`, and `https://code.claude.com/docs/en/plugins.md`.
- Current docs state plugin dependencies live in `.claude-plugin/plugin.json` `dependencies`, can use `{ name, version, marketplace }`, and cross-marketplace dependencies require root marketplace `allowCrossMarketplaceDependenciesOn`.
- Current docs state dependency release tags use `{plugin-name}--v{version}` and `claude plugin tag --push` validates plugin contents/version parity before pushing; 6.2 should only check/read parity and not run push/tag.
- Current docs state plugin manifest `version` wins over marketplace entry if both are set; curdx-flow intentionally requires them to stay equal for release predictability.

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/release/types.ts`
- `src/runtime/release/index.ts`
- `package.json`

**NEW expected:**

- `src/runtime/release/parity.ts`
- `tests/runtime/release/release-parity.test.ts`
- `tests/fixtures/release-candidate/release-parity-fixtures.json`

**Read-only context:**

- `scripts/check-versions.mjs`
- `scripts/bump-version.mjs`
- `package.json`
- `package-lock.json`
- `plugins/curdx-flow/.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `src/registry/capabilities.ts`
- `src/registry/plugins/pua.ts`
- `src/registry/plugins/claude-mem.ts`
- `src/registry/plugins/chrome-devtools-mcp.ts`
- `src/registry/plugins/ui-ux-pro-max.ts`
- `tests/runner/capabilities.test.ts`
- `_bmad-output/implementation-artifacts/6-1-release-evidence-model-dry-run-verdict.md`

## References

- `_bmad-output/planning-artifacts/epics.md#Story 6.2`
- `_bmad-output/planning-artifacts/prd.md#FR54`
- `_bmad-output/planning-artifacts/prd.md#FR57`
- `_bmad-output/planning-artifacts/prd.md#FR58`
- `_bmad-output/planning-artifacts/prd.md#FR59`
- `_bmad-output/planning-artifacts/prd.md#NFR18`
- `_bmad-output/planning-artifacts/prd.md#NFR26`
- `_bmad-output/planning-artifacts/architecture.md#IP-NAME-001`
- `_bmad-output/planning-artifacts/architecture.md#IP-REL-002`
- `_bmad-output/planning-artifacts/architecture.md#IP-REL-003`
- `_bmad-output/implementation-artifacts/6-1-release-evidence-model-dry-run-verdict.md`
- `https://code.claude.com/docs/llms.txt`
- `https://code.claude.com/docs/en/plugins-reference.md`
- `https://code.claude.com/docs/en/plugin-dependencies.md`

## Dev Agent Record

### Agent Model Used

GPT-5

### Debug Log References

- `npm run check-versions`：通过，五个版本面均为 7.2.1。
- `npm run test:runner`：通过，6 tests。
- `npm run test:release`：通过，13 tests。
- `npm run typecheck`：通过。
- `npm run verify`：通过，包含 release parity tests。
- `claude plugin validate ./plugins/curdx-flow`：通过。
- Code review：发现 allowlist 只检查缺失，未阻止额外未知 marketplace 放行；补红测后修复，复跑验证均通过。

### Completion Notes List

- 新增 `evaluateReleaseParity()`，输出 version parity、plugin dependency parity、external MCP boundary 和 version bump guidance 四类 release checks，可直接输入 6.1 `evaluateReleaseDryRun()`。
- version parity 覆盖 `package.json`、`package-lock.json` root、`package-lock.json packages[""]`、plugin manifest、marketplace entry，漂移时输出 `not-releasable` blocker 和 bump script guidance。
- dependency parity 覆盖 manifest dependencies、canonical dependency specs、registry plugin packages、marketplace allowlist；依赖 id/marketplace/registry required/type 漂移阻塞 release。
- external MCP boundary 明确 `context7`、`sequential-thinking` 属于 external MCP readiness，不允许被建模为 plugin dependencies。
- Review 修复：marketplace allowlist 额外放行未知 marketplace 也会阻塞 release，避免扩大 cross-marketplace trust。

### File List

- `src/runtime/release/types.ts`
- `src/runtime/release/parity.ts`
- `src/runtime/release/index.ts`
- `tests/runtime/release/release-parity.test.ts`
- `tests/fixtures/release-candidate/release-parity-fixtures.json`
- `_bmad-output/implementation-artifacts/6-2-version-manifest-registry-marketplace-parity.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Started dev-story implementation.
- 2026-05-17: Implemented version/manifest/registry/marketplace parity checks, fixtures, and review fixes; marked story done.

## Senior Developer Review (AI)

### Review Date

2026-05-17

### Review Outcome

Approve

### Findings

- Fixed [High]: marketplace allowlist validation initially detected missing dependency marketplaces but allowed extra unknown marketplaces, which could widen cross-marketplace trust during plugin dependency resolution.

### Action Items

- [x] [High] Block unexpected marketplace allowlist entries unless they are backed by canonical dependency specs, registry packages, and tests.

### Verification

- `npm run check-versions`：通过。
- `npm run test:runner`：通过，6 tests。
- `npm run test:release`：通过，13 tests。
- `npm run typecheck`：通过。
- `npm run verify`：通过。
- `claude plugin validate ./plugins/curdx-flow`：通过。

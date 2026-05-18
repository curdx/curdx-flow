# Story 3.1: Project Topology and Runtime Discovery

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为让 curdx-flow 验证一个未知项目的用户，
我希望系统能识别当前项目是前端、后端、全栈、CLI、库、monorepo 还是 Claude Code plugin，
以便后续验证计划基于真实项目结构，而不是假设所有项目都是单一 Node app。

## Acceptance Criteria

1. **结构化 runtime topology：** 给定用户在一个项目根目录运行 curdx-flow，当 runtime discovery 扫描工作区时，必须输出结构化 JSON/type，包含项目类型、roots、package manager、主要入口、scripts、测试/验证线索、服务线索、API/data/browser 线索；不得只输出自然语言描述。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.1`; `_bmad-output/planning-artifacts/prd.md#FR6`]
2. **通用项目分类：** 给定项目是 frontend、backend、full-stack、CLI、library、monorepo 或 Claude Code plugin，当 discovery 运行时，必须给出合理分类、置信度和 reasons；未识别项目不得默认为 Node/frontend，必须标记 `unknown` 或 `needs-human-input`。[Source: `_bmad-output/planning-artifacts/prd.md#FR7`; `_bmad-output/planning-artifacts/architecture.md#FR6-FR11 Project Detection and Runtime Plan`]
3. **多 root/workspace：** 给定项目包含多个 package roots 或 workspace，当 discovery 输出 topology 时，必须逐 root 列出 path、type、package manager、scripts、entry hints 和 possible services；不得只检测第一个 package。[Source: `_bmad-output/planning-artifacts/prd.md#FR11`; `_bmad-output/planning-artifacts/epics.md#Story 3.1`]
4. **Claude Code plugin 识别：** 给定 discovery 发现 `.claude-plugin/plugin.json`、hooks、skills、agents、bin 或 `plugins/curdx-flow` 类似结构，当项目被分类为 Claude Code plugin 时，topology 必须记录 plugin root、manifest path、hook wiring、plugin-local executable 和 validation command 线索。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.1`; Claude Code docs index: <https://code.claude.com/docs/llms.txt>]
5. **缺失事实必须阻塞或请求人工输入：** 给定 discovery 无法可靠判断入口、运行方式或验证方式，当输出结果时，必须生成 blocker 或 `needs-human-input`，说明缺少哪些事实；不得基于猜测生成成功验证计划。[Source: `_bmad-output/planning-artifacts/architecture.md#Failure States`; `_bmad-output/planning-artifacts/prd.md#FR10`]
6. **验证覆盖：** 给定 Story 3.1 完成，当执行验证时，最小验证命令必须包含 `npm run typecheck` 和 runtime discovery tests；测试必须覆盖 frontend、backend、full-stack、CLI/library、monorepo、Claude Code plugin、unknown project 和 malformed package metadata。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.1`; `_bmad-output/planning-artifacts/prd.md#NFR29`]

## Tasks / Subtasks

- [x] 固定 discovery contract 和边界（AC: 1-6）
  - [x] 新增 `src/runtime/discovery/types.ts`，定义 `RuntimeTopology`、`ProjectRootTopology`、`RuntimeProjectType`、`DiscoveryBlocker`、`DiscoveryHint` 等稳定类型。
  - [x] 新增 `plugins/curdx-flow/schemas/runtime-topology.schema.json`，并更新 `src/runtime/contracts/index.ts`、`tests/fixtures/contracts/**`、`tests/contracts/runtime-contracts.test.ts`。
  - [x] Discovery 只读取本地文件和目录元数据；不得启动服务、安装依赖、执行 package scripts、调用浏览器/MCP，且不得写 `.curdx/**`。

- [x] 实现静态 project topology discovery（AC: 1, 2, 3, 5）
  - [x] 新增 `src/runtime/discovery/project-topology.ts`，导出 `discoverRuntimeTopology(input)`。
  - [x] 识别 `package.json`、lockfile、workspace 配置、常见 config 文件、source tree、scripts、bin/main/module/exports/type 字段。
  - [x] 支持 npm/pnpm/yarn/bun lockfile 检测，但本仓库默认 npm；未引入新 package manager lockfile。
  - [x] 将 scripts 归类为 dev/start/build/test/lint/typecheck/e2e/plugin-validation hints；Story 3.2 保留完整 command discovery。
  - [x] 无法判断入口/运行方式时输出 `blockers[]` 或 root/status `needs-human-input`，并把 `overallType` 保持 `unknown` 或低置信度组合。

- [x] 支持多 root 与 workspace（AC: 3）
  - [x] 从 root package `workspaces`、`packageManager`、lockfile、子目录 package.json 发现 workspace roots。
  - [x] 每个 root 都输出相对路径、package manager、project type、confidence、entry hints、service hints、API/data/browser hints、script summary。
  - [x] Monorepo 顶层 topology 标记 `overallType: monorepo`，同时保留子 root 类型，不丢失 backend/frontend/full-stack 子项目。

- [x] 支持 Claude Code plugin 项目识别（AC: 4）
  - [x] 识别 plugin root：当前 root 有 `.claude-plugin/plugin.json`，或 `plugins/*/.claude-plugin/plugin.json`。
  - [x] 记录 manifest path、skills/agents/hooks/hooks.json、bin 可执行文件、schemas/templates/references 线索。
  - [x] 给出 validation command hint：`claude plugin validate <plugin-root>`；只作为 hint，不在 discovery 中执行。
  - [x] 遵守官方 Claude Code plugin 结构：plugin root 下有 `.claude-plugin/plugin.json`，技能/agents/hooks/bin 等位于 plugin root；topology 使用相对路径事实，避免安装态绝对路径耦合。

- [x] 增加 fixture-driven tests（AC: 1-6）
  - [x] 新增 `tests/runtime/discovery/project-topology.test.ts`。
  - [x] 使用 `mkdtemp` 构造 runtime discovery fixture，覆盖 frontend app、backend/API app、full-stack app、CLI/library、monorepo、Claude Code plugin-like project、unknown project、malformed package metadata。
  - [x] Tests 使用 `mkdtemp`，不在 repo root 写真实 `.curdx/**`、`specs/**`、`.claude/**`、`.mcp.json`。
  - [x] 验证 unknown/malformed 不会默认为 frontend/Node 成功态。

- [x] 验证和记录（AC: 6）
  - [x] 运行 focused discovery tests：`npx vitest run tests/runtime/discovery/project-topology.test.ts`。
  - [x] 新增 contract/schema 后运行 `npm run test:contracts`。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`，确认前序 runtime/report/verdict/capability gates 没有回归。

### Review Findings

- [x] [Review][Patch] `package.json` entry fields and workspace patterns could include escaping paths such as `../outside.js` or `../outside/*`, causing discovery to emit contract-invalid topology paths or inspect outside the workspace boundary. Fixed by filtering unsafe workspace patterns, omitting unsafe package entry paths from hints, and adding regression coverage. [`src/runtime/discovery/project-topology.ts`; `tests/runtime/discovery/project-topology.test.ts`]
- [x] [Review][Patch] A valid workspace aggregator root with `workspaces` but no app framework signals was classified as `unknown` and could add unnecessary `needs-human-input` blockers to monorepo topology. Fixed by classifying workspace roots as `monorepo` and asserting ready monorepo status in tests. [`src/runtime/discovery/project-topology.ts`; `tests/runtime/discovery/project-topology.test.ts`]

## Dev Notes

### 当前发现

- `src/runtime/discovery/` 当前不存在；Story 3.1 是 Epic 3 的第一个 runtime readiness slice，应新增 discovery module，而不是塞进 planner、reports 或 capabilities。[Source: `_bmad-output/planning-artifacts/architecture.md#FR6-FR11 Project Detection and Runtime Plan`]
- `src/runtime/contracts/index.ts` 当前已管理 evidence、state、session、adapter、verdict、policy、hook gate、artifact index、verification report。新增 `runtimeTopology` contract 时必须同步 schema descriptor、TS interface、runtime guard rules 和 contract fixtures。[Source: `src/runtime/contracts/index.ts`; `tests/contracts/runtime-contracts.test.ts`]
- 现有 tests 已用 Vitest + fixture JSON 做 contract parity。Story 3.1 的 schema 测试应延续同一模式，不要写自然语言 snapshot 作为唯一断言。[Source: `tests/contracts/runtime-contracts.test.ts`]
- Story 2.5 已让 planner 接收 topology hints，但不负责文件系统扫描。Story 3.1 应输出后续 planner 可消费的 topology facts，不做 evidence requirement routing。[Source: `_bmad-output/implementation-artifacts/2-5-capability-routing-remediation-planner.md`; `src/runtime/planner/types.ts`]
- Story 2.6 已强化 report-only evidence surface；Story 3.1 不需要改 report renderer，除非 discovery result 要进入报告展示面。本 slice 以 runtime type/schema/tests 为主。[Source: `_bmad-output/implementation-artifacts/2-6-qa-report-only-evidence-surface.md`]

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户进入未知项目时，curdx-flow 不能假设它是单一 Node/frontend app。 |
| Runtime Directory | `src/runtime/discovery/**` owns static project topology discovery. |
| Planner Boundary | `src/runtime/planner/**` consumes topology later; this story不改完整验证计划生成。 |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。 |
| Schema / Contract | `plugins/curdx-flow/schemas/runtime-topology.schema.json` plus `src/runtime/contracts/index.ts` runtime guard。 |
| Contract Test | `tests/contracts/runtime-contracts.test.ts` and `tests/fixtures/contracts/**`。 |
| Runtime Test | `tests/runtime/discovery/project-topology.test.ts`。 |
| Fixture | `tests/fixtures/runtime-discovery/**`，只读 fixture 或 `mkdtemp`。 |
| Evidence Output | 本 story 不写 evidence ledger；topology 是 future planner/report input。 |
| Failure Mode | unknown project、malformed package metadata、missing scripts/entry、multi-root partial confidence。 |
| Verification Commands | `npx vitest run tests/runtime/discovery/project-topology.test.ts`, `npm run test:contracts`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- Runtime core owns decisions; discovery owns facts. Discovery must not start processes, run package scripts, perform browser/API/data probes, install dependencies, or mark user work complete.[Source: `_bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries`]
- Unknown is a valid output. If key facts are missing, return `unknown`/`needs-human-input` plus blockers; do not invent an entry point, port, endpoint, or validation command.[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.1`]
- Contract additions must preserve unknown future fields at boundaries and reject malformed/missing required fields through both schema and runtime guard.[Source: `tests/contracts/runtime-contracts.test.ts`]
- Keep plugin product surface stable. This story may inspect plugin-like fixture structure but must not change `plugins/curdx-flow/.claude-plugin/plugin.json`, `hooks/hooks.json`, generated hook bundles, or shipped skill/agent frontmatter.
- Do not use local stale docs as plugin truth. For Claude Code plugin structure, latest source is official docs index and installed `claude` CLI behavior.[Source: `_bmad-output/project-context.md#Claude Code Plugin`]

### Latest Claude Code Information

- 官方 Claude Code 文档索引入口：<https://code.claude.com/docs/llms.txt>。
- Plugin reference 当前定义的 product layout 仍以 plugin root 下 `.claude-plugin/plugin.json` 为 manifest 入口，并支持 plugin-local `bin/` 可执行文件、hooks、skills、agents、commands 和 dependencies 等字段；Story 3.1 只把这些作为 discovery hints，不执行验证或安装。
- `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PROJECT_DIR}` 是 plugin 安装态路径语义。Topology 中记录 plugin-local executable 和 hook wiring 时，应使用相对 path facts，避免把本机绝对路径写成 runtime contract。

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/contracts/index.ts`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/fixtures/contracts/valid/contracts.json`
- `tests/fixtures/contracts/valid/unknown-fields.json`
- `tests/fixtures/contracts/invalid/missing-required.json`
- `tests/fixtures/contracts/invalid/bad-enum.json`
- `tests/fixtures/contracts/invalid/unsupported-version.json`
- `tests/fixtures/contracts/invalid/schema-only-rules.json`
- `package.json`（仅当新增 `test:discovery` script）

**NEW expected:**

- `src/runtime/discovery/types.ts`
- `src/runtime/discovery/project-topology.ts`
- `src/runtime/discovery/index.ts`
- `plugins/curdx-flow/schemas/runtime-topology.schema.json`
- `tests/runtime/discovery/project-topology.test.ts`
- `tests/fixtures/runtime-discovery/**`

**Do not touch for this story unless forced by tests:**

- `plugins/curdx-flow/.claude-plugin/plugin.json`
- `plugins/curdx-flow/hooks/hooks.json`
- `plugins/curdx-flow/hooks/scripts/**`
- `src/hooks/**`
- `plugins/curdx-flow/skills/**`
- `plugins/curdx-flow/agents/**`

### Known Risks To Prevent

- Do not classify unknown/malformed projects as frontend just because a `package.json` exists.
- Do not ignore workspace child packages after detecting the first root.
- Do not run user scripts during discovery; script names are facts, not commands to execute.
- Do not add network-required behavior or MCP/browser probes to this static discovery story.
- Do not leak absolute local paths into portable topology facts unless a field explicitly represents scanned workspace root.
- Do not create schema without updating runtime contract guard and fixtures.
- Do not hand-edit generated hook bundles.
- Do not widen plugin skill permissions, dependencies, or manifest fields.

## Project Structure Notes

- Alignment: Story 3.1 starts Epic 3 by creating the static runtime topology layer required before command detection, cold start, service lifecycle, and journey verification.
- Existing good pattern: runtime modules are narrow (`state`, `evidence`, `policy`, `verdict`, `reports`, `capabilities`, `planner`) with `types.ts` plus focused tests. Follow that structure.
- Brownfield note: `plugins/curdx-flow` is the shipped plugin, not a fixture. Use separate fixture data for plugin-like discovery tests to avoid mutating product files.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 3.1`
- `_bmad-output/planning-artifacts/epics.md#Epic 3`
- `_bmad-output/planning-artifacts/prd.md#FR6`
- `_bmad-output/planning-artifacts/prd.md#FR7`
- `_bmad-output/planning-artifacts/prd.md#FR10`
- `_bmad-output/planning-artifacts/prd.md#FR11`
- `_bmad-output/planning-artifacts/prd.md#NFR29`
- `_bmad-output/planning-artifacts/architecture.md#FR6-FR11 Project Detection and Runtime Plan`
- `_bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries`
- `_bmad-output/project-context.md#Claude Code Plugin`
- `_bmad-output/implementation-artifacts/2-5-capability-routing-remediation-planner.md`
- `_bmad-output/implementation-artifacts/2-6-qa-report-only-evidence-surface.md`
- `src/runtime/contracts/index.ts`
- `tests/contracts/runtime-contracts.test.ts`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>
- Claude Code plugins reference: <https://code.claude.com/docs/en/plugins-reference>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-05-17: RED `npx vitest run tests/runtime/discovery/project-topology.test.ts` failed because `src/runtime/discovery/index.ts` did not exist, confirming the new tests exercised missing functionality.
- 2026-05-17: GREEN `npx vitest run tests/runtime/discovery/project-topology.test.ts` passed with 8 topology discovery tests.
- 2026-05-17: `npm run test:contracts` passed after adding `runtimeTopology` schema, runtime guard, and fixtures.
- 2026-05-17: `npm run typecheck` passed after tightening `readdir` inference in the discovery scanner.
- 2026-05-17: Full `npm run verify` passed, including the newly added `npm run test:discovery` gate.
- 2026-05-17: Code review found 2 patch findings; both were fixed and revalidated with `npm run test:discovery`, `npm run typecheck`, `npm run test:contracts`, and `npm run verify`.

### Completion Notes List

- Added `runtimeTopology` as a first-class runtime contract with JSON schema, TypeScript guard rules, valid/invalid contract fixtures, and unknown future field preservation coverage.
- Added static runtime topology discovery for frontend, backend/API, full-stack, CLI, library, monorepo, unknown, malformed package metadata, and Claude Code plugin-like projects.
- Discovery reads only local file/directory metadata and package/plugin manifests; it does not execute package scripts, start services, call browsers/MCPs, install dependencies, or write `.curdx/**`.
- Topology output now includes package manager, roots, scripts, entry/service/API/data/browser/validation/plugin hints, blockers, confidence, Claude plugin root details, hook wiring, bin paths, and `claude plugin validate <plugin-root>` hint.
- Added `test:discovery` and wired it into `npm run verify` so runtime discovery coverage is part of the release-quality gate.
- Code review follow-up complete: unsafe path facts are filtered, workspace aggregator roots classify as `monorepo`, and both fixes have focused regression coverage.

### File List

- `_bmad-output/implementation-artifacts/3-1-project-topology-runtime-discovery.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `package.json`
- `plugins/curdx-flow/schemas/runtime-topology.schema.json`
- `src/runtime/contracts/index.ts`
- `src/runtime/discovery/index.ts`
- `src/runtime/discovery/project-topology.ts`
- `src/runtime/discovery/types.ts`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/fixtures/contracts/valid/contracts.json`
- `tests/fixtures/contracts/valid/unknown-fields.json`
- `tests/fixtures/contracts/invalid/missing-required.json`
- `tests/fixtures/contracts/invalid/bad-enum.json`
- `tests/fixtures/contracts/invalid/unsupported-version.json`
- `tests/runtime/discovery/project-topology.test.ts`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Implemented runtime topology discovery, schema/contract guard, tests, and verification gate; marked story ready for review.
- 2026-05-17: Addressed code review findings (2 patch items), reran full verification, and moved story status to done.

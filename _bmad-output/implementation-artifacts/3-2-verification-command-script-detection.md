# Story 3.2: Verification Command and Script Detection

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为使用 curdx-flow 验证项目的开发者，
我希望系统能识别项目已有的安装、启动、测试、构建、lint、E2E、API、plugin validation 等命令，
以便验证计划优先复用项目已有脚本，而不是发明不可靠的命令。

## Acceptance Criteria

1. **命令候选结构化输出：** 给定 runtime topology 已识别一个或多个 project roots，当 command discovery 分析 package scripts、lockfile、配置文件和已知框架约定时，必须输出 install、dev/start、build、test、lint、typecheck、e2e、API/contract、health、plugin validate 的候选命令；每个候选必须包含 root、executable、argv、confidence、risk level 和 evidence purpose。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.2`; `_bmad-output/planning-artifacts/prd.md#FR8`; `_bmad-output/planning-artifacts/prd.md#FR9`]
2. **多生态命令策略：** 给定项目存在 npm、pnpm、yarn、bun、Python、Go、Rust 或其他非 Node 线索，当 command discovery 运行时，系统必须根据 lockfile/manifest 选择合适包管理器或命令策略；不得把所有项目都强行转换成 npm 命令。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.2`; `_bmad-output/planning-artifacts/prd.md#FR7`; `_bmad-output/planning-artifacts/prd.md#FR9`]
3. **项目脚本优先：** 给定项目已有明确验证脚本，当 planner 需要选择验证命令时，应优先使用项目已有脚本；只有在脚本缺失时才生成建议或最小替代命令，并将其标记为 `inferred` 或 `degraded`。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.2`; `_bmad-output/planning-artifacts/architecture.md#FR6-FR11 Project Detection and Runtime Plan`]
4. **风险分级和 report-only 执行边界：** 给定某个命令可能修改源码、安装依赖、启动服务或执行高风险操作，当 command discovery 输出该命令时，必须标记风险等级；report-only 模式不得执行会修改源码或配置的命令。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.2`; `_bmad-output/implementation-artifacts/2-4-report-only-fix-mode-risk-policy.md#Architecture Guardrails`]
5. **选择理由和未选择原因：** 给定命令检测结果包含多个候选，当 planner 选择命令时，必须记录选择理由和未选择原因；未选择的高相关候选应在报告中作为可选验证路径展示。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.2`; `_bmad-output/implementation-artifacts/2-5-capability-routing-remediation-planner.md`]
6. **验证覆盖：** 给定 Story 3.2 完成，当执行验证时，最小验证命令必须包含 `npm run typecheck`、command discovery tests；测试必须覆盖多 package manager、缺脚本、多个候选、plugin validation scripts、inferred command、report-only 风险限制和 argv-array 命令安全。[Source: `_bmad-output/planning-artifacts/epics.md#Story 3.2`]

## Tasks / Subtasks

- [x] 固定 command discovery contract 和边界（AC: 1-6）
  - [x] 新增 `src/runtime/discovery/command-detection.ts`，导出 `detectVerificationCommands(input)`。
  - [x] 新增 command candidate 类型，包含 `id`、`root`、`purpose`、`source`、`executable`、`argv`、`confidence`、`riskLevel`、`mutatesWorkspace`、`startsService`、`evidencePurpose`、`reason`、`selected`/`selectionReason` 等字段。
  - [x] 不执行命令；只输出 argv-array 候选和风险事实，不启动服务、不安装依赖、不写 evidence/state/report。
  - [x] 本 story 保持 TS-only runtime type，未新增 shipped schema；已用 focused runtime tests 覆盖。

- [x] 基于 Story 3.1 topology 生成 Node/package-manager 命令候选（AC: 1, 2, 3, 6）
  - [x] 输入接受 `RuntimeTopology`，复用 `root.packageManager`、`root.scripts`、plugin roots 等 topology facts。
  - [x] 对 npm/pnpm/yarn/bun 输出正确 argv-array；禁止 shell 拼接字符串。
  - [x] 从 scripts 中识别 install、dev/start、build、test、lint、typecheck、e2e、api/contract、health、plugin validation。
  - [x] 项目已有脚本优先；脚本缺失时输出 `source: inferred`、`degraded: true` 的候选，并写明缺失原因。

- [x] 支持非 Node 线索和安全 fallback（AC: 2, 3, 6）
  - [x] 从 topology entry hints 支持 Python、Go、Rust 线索：`pyproject.toml`/`requirements.txt`、`go.mod`、`Cargo.toml`。
  - [x] 为非 Node 项目输出 `python -m pytest`、`go test ./...`、`cargo test` 候选，并标记 inferred/confidence。
  - [x] 不把非 Node root 自动转换成 `npm run test`。

- [x] 风险模型与 report-only 限制（AC: 4, 6）
  - [x] 命令候选区分只读验证、启动服务、安装依赖、构建生成物、源码/配置可能修改、release/global 命令等风险。
  - [x] 对 install、migration、generate/write/destructive script、release、publish、git push/tag 等命令标记 high/critical 或等价风险；report-only 下 `allowedInReportOnly` 为 false。
  - [x] 复用 Story 2.4 action-risk policy 语义，不新增执行绕过路径。

- [x] 多候选选择摘要（AC: 3, 5, 6）
  - [x] 输出 root-level plan/summary，记录每个 purpose 的 selected candidate 和 alternatives。
  - [x] 选择优先级为 plugin/explicit script 高于 inferred generic command，且 exact script 和 confidence 会影响排序。
  - [x] 未选择候选有 `notSelectedReason`，便于后续 report 展示可选验证路径。
  - [x] 本 story 只产出 command discovery plan；完整 runtime planner 执行和服务生命周期留给 Story 3.3。

- [x] 增加 focused tests（AC: 1-6）
  - [x] 新增 `tests/runtime/discovery/command-detection.test.ts`。
  - [x] 覆盖 npm/pnpm/yarn/bun、多 root、缺脚本 inferred/degraded、多个候选选择、Claude Code plugin validation、非 Node Python/Go/Rust、report-only 风险限制、argv-array 命令安全。
  - [x] Tests 使用 in-memory topology；不在 repo root 写 `.curdx/**`、`specs/**`、`.claude/**`、`.mcp.json`。

- [x] 验证和记录（AC: 6）
  - [x] 运行 focused command discovery tests：`npx vitest run tests/runtime/discovery/command-detection.test.ts`。
  - [x] 运行 `npm run test:discovery`。
  - [x] 未新增 contract/schema；`npm run test:contracts` 仍通过于 full verify。
  - [x] 运行 `npm run typecheck`。
  - [x] 运行 `npm run verify`。

### Review Findings

- [x] [Review][Patch] High-risk package script contents such as `rm -rf` could be wrapped safely as `npm run <script>` but still be marked low risk and report-only executable. Fixed by detecting destructive script content, setting high risk/mutatesWorkspace, and adding regression coverage. [`src/runtime/discovery/command-detection.ts`; `tests/runtime/discovery/command-detection.test.ts`]
- [x] [Review][Patch] Candidate selection inferred script names back from ids, which was fragile for script names containing `:`. Fixed by carrying explicit `scriptName` on script candidates and using that for exact-script prioritization. [`src/runtime/discovery/command-detection.ts`]
- [x] [Validation][Patch] Existing capability doctor test ran two runtime CLI child processes under one 5s Vitest timeout, producing repeatable local timeout during full verify. Fixed by giving that specific integration-style test a 15s timeout while keeping each child process timeout at 5s. [`tests/runtime/capabilities/capability-doctor.test.ts`]

## Dev Notes

### 当前发现

- Story 3.1 已新增 `RuntimeTopology`、`ProjectRootTopology`、`DiscoveryHint`、`runtime-topology.schema.json` 和 `discoverRuntimeTopology()`；3.2 应复用这些 facts，不重新扫描完整项目结构。[Source: `_bmad-output/implementation-artifacts/3-1-project-topology-runtime-discovery.md#Completion Notes List`; `src/runtime/discovery/types.ts`]
- `RuntimeTopology.roots[].scripts`、`packageManager`、`validationHints`、`serviceHints`、`pluginHints` 已提供命令检测入口。3.2 应把这些转换成安全 argv-array candidates，而不是执行 scripts。[Source: `src/runtime/discovery/project-topology.ts`]
- Story 3.1 review 已修复 escaped path 和 workspace aggregator 问题；3.2 处理 command root/path 时必须继续保持 workspace-relative 安全，不输出 `../`、绝对路径或 shell-concatenated commands。[Source: `_bmad-output/implementation-artifacts/3-1-project-topology-runtime-discovery.md#Review Findings`]
- `src/runtime/policy/action-risk-policy.ts` 已实现 report-only/fix/release 风险语义；3.2 的 command candidate 风险字段应对齐该语义，不新增执行权限模型。[Source: `_bmad-output/implementation-artifacts/2-4-report-only-fix-mode-risk-policy.md`; `src/runtime/policy/types.ts`]
- `src/runtime/planner/capability-routing.ts` 已有 route selection/fallback/blocker 表达；3.2 可借鉴 selected/alternatives/reason 结构，但不应把 command detection 塞进 capability routing。[Source: `_bmad-output/implementation-artifacts/2-5-capability-routing-remediation-planner.md`; `src/runtime/planner/types.ts`]

### Previous Story Intelligence

- Story 3.1 输出 topology contract，且 `npm run verify` 已包含 `test:discovery`。3.2 应继续在 `tests/runtime/discovery/**` 下增加 focused coverage，避免 command detection 漂到 planner/report 层。
- Story 3.1 审查修复的两个问题是本 story 的硬约束：不要输出不安全 path；不要把正常 workspace root 误标 unknown/blocker。
- Story 2.4/2.6 的 report-only 边界仍然适用：命令可以被展示、排序和标记风险，但 report-only 不能执行 install/source/config/release 类动作。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户已有验证脚本时，curdx-flow 不能发明不可靠命令或把所有项目当 npm app。 |
| Runtime Directory | `src/runtime/discovery/**` owns command candidate detection from topology facts. |
| Planner Boundary | `src/runtime/planner/**` will consume command plans later; this story只产出候选和选择摘要。 |
| Plugin Surface | 不新增 slash command、skill、agent、hook、manifest dependency。 |
| Schema / Contract | Prefer TS-only command candidate type unless a shipped JSON artifact is introduced; if shipped, add schema/contract fixtures. |
| Contract Test | Required only if schema/contract guard changes. |
| Runtime Test | `tests/runtime/discovery/command-detection.test.ts` plus `npm run test:discovery`。 |
| Fixture | In-memory topology or `mkdtemp`; no repo-root `.curdx/**` writes. |
| Evidence Output | 本 story 不写 evidence ledger；command candidates are future planner/service inputs. |
| Report Surface | No report renderer change required; selected/alternative reasons should be report-consumable later. |
| Failure Mode | missing scripts, non-Node roots, unsafe shell commands, report-only disallowed risk, inferred/degraded fallback. |
| Verification Commands | `npx vitest run tests/runtime/discovery/command-detection.test.ts`, `npm run test:discovery`, `npm run typecheck`, `npm run verify`。 |

### Architecture Guardrails

- Command discovery is static planning input. It must not execute commands, spawn services, install dependencies, call MCP/browser, or write `.curdx/**`.
- Every command must be represented as executable plus argv array. Do not build shell-concatenated command strings for npm, pnpm, yarn, bun, python, go, rust, git, or Claude plugin validation.
- Prefer explicit project scripts. Inferred commands must be visibly marked `inferred`/`degraded` and lower confidence.
- Report-only risk must be visible on candidates. Discovery can expose high-risk commands as facts, but later execution layers must respect `allowedInReportOnly: false`.
- Plugin validation hints must use official Claude Code command shape `claude plugin validate <plugin-root>` as an argv-array candidate and must not run inside discovery.

### Latest Claude Code Information

- 官方 Claude Code 文档索引入口：<https://code.claude.com/docs/llms.txt>。
- Claude Code plugin validation is an external CLI command, not a discovery side effect. Story 3.2 should output `executable: "claude"` and `argv: ["plugin", "validate", "<plugin-root>"]` candidates for plugin roots found by Story 3.1.
- Keep plugin-local path facts relative to workspace/plugin root; do not encode installed absolute paths or mutate plugin manifest/hooks/skills.

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/discovery/index.ts`
- `src/runtime/discovery/types.ts`
- `src/runtime/discovery/project-topology.ts`
- `package.json`（仅当新增/调整 discovery test script）
- `tests/runtime/discovery/project-topology.test.ts`

**NEW expected:**

- `src/runtime/discovery/command-detection.ts`
- `tests/runtime/discovery/command-detection.test.ts`

**Only if shipped schema/contract boundary changes:**

- `plugins/curdx-flow/schemas/**`
- `src/runtime/contracts/index.ts`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/fixtures/contracts/**`

**Do not touch for this story unless forced by tests:**

- `plugins/curdx-flow/.claude-plugin/plugin.json`
- `plugins/curdx-flow/hooks/hooks.json`
- `plugins/curdx-flow/hooks/scripts/**`
- `src/hooks/**`
- `plugins/curdx-flow/skills/**`
- `plugins/curdx-flow/agents/**`

### Known Risks To Prevent

- Do not execute discovered commands.
- Do not infer npm commands for Python/Go/Rust/non-Node roots.
- Do not output shell command strings where argv arrays are required.
- Do not mark install/generate/migration/release/publish/git push/tag as report-only executable.
- Do not hide inferred/degraded commands as if they were explicit project scripts.
- Do not expand workspace or command paths outside the workspace boundary.
- Do not change hook bundles or plugin manifest for command detection.

## Project Structure Notes

- Alignment: Story 3.2 builds directly on Story 3.1 topology and prepares command facts for Story 3.3 service lifecycle, without executing anything.
- Existing good pattern: keep discovery modules pure and fixture-driven; use `tests/runtime/discovery/**` with in-memory topology where possible.
- Brownfield note: `plugins/curdx-flow` is the shipped plugin; plugin validation command detection should be tested with plugin-like fixture/topology, not by mutating the product manifest.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 3.2`
- `_bmad-output/planning-artifacts/epics.md#Epic 3`
- `_bmad-output/planning-artifacts/prd.md#FR8`
- `_bmad-output/planning-artifacts/prd.md#FR9`
- `_bmad-output/planning-artifacts/prd.md#FR10`
- `_bmad-output/planning-artifacts/architecture.md#FR6-FR11 Project Detection and Runtime Plan`
- `_bmad-output/implementation-artifacts/3-1-project-topology-runtime-discovery.md`
- `_bmad-output/implementation-artifacts/2-4-report-only-fix-mode-risk-policy.md`
- `_bmad-output/implementation-artifacts/2-5-capability-routing-remediation-planner.md`
- `src/runtime/discovery/types.ts`
- `src/runtime/discovery/project-topology.ts`
- `src/runtime/policy/types.ts`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>
- Claude Code plugins reference: <https://code.claude.com/docs/en/plugins-reference>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-05-17: RED `npx vitest run tests/runtime/discovery/command-detection.test.ts` failed because `detectVerificationCommands` was not implemented.
- 2026-05-17: GREEN `npx vitest run tests/runtime/discovery/command-detection.test.ts` passed with 8 command detection tests.
- 2026-05-17: `npm run test:discovery` passed with project topology and command detection tests.
- 2026-05-17: `npm run typecheck` passed after exporting command detection types.
- 2026-05-17: First full `npm run verify` passed before review patch; second verify exposed an existing capability doctor timeout.
- 2026-05-17: Review patch fixed destructive script risk and scriptName selection; `npm run test:discovery` and `npm run typecheck` passed.
- 2026-05-17: `npm run test:capabilities` passed after increasing the specific runtime doctor compatibility test timeout.
- 2026-05-17: Final `npm run verify` passed.

### Completion Notes List

- Added command detection plan generation from `RuntimeTopology`, producing structured command candidates with purpose, source, executable, argv, confidence, risk, report-only allowance, evidence purpose, and selection metadata.
- Added Node package-manager handling for npm/pnpm/yarn/bun without forcing all roots to npm.
- Added explicit script detection for install, dev/start, build, test, lint, typecheck, e2e, API/contract, health, migration, release, and Claude plugin validation scripts.
- Added inferred/degraded fallback commands for missing Node test scripts and Python/Go/Rust project metadata.
- Added Claude Code plugin validation command candidates using `claude plugin validate <plugin-root>` as argv-array facts only; discovery does not execute validation.
- Added selection summaries with selected candidate ids, alternatives, selected reasons, and not-selected reasons.
- Added report-only risk gating for install/build/service/migration/destructive/release commands.
- Code review follow-up complete: destructive script content is high risk, scriptName selection is stable, and the capability doctor timeout is explicit.

### File List

- `_bmad-output/implementation-artifacts/3-2-verification-command-script-detection.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/runtime/discovery/command-detection.ts`
- `src/runtime/discovery/index.ts`
- `tests/runtime/discovery/command-detection.test.ts`
- `tests/runtime/capabilities/capability-doctor.test.ts`

### Change Log

- 2026-05-17: Story context created and marked ready-for-dev.
- 2026-05-17: Implemented verification command/script detection and marked story ready for review.
- 2026-05-17: Addressed code review/validation findings, reran full verification, and moved story status to done.

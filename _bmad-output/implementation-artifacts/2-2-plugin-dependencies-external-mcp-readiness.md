# Story 2.2: Plugin Dependencies 与 External MCP Readiness

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为 curdx-flow 用户，
我希望系统正确区分 Claude Code plugin dependencies 和外部 MCP，并检测它们是否真的可用，
以便缺少 `pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max`、`context7` 或 `sequential-thinking` 时，系统能给出明确降级和补救，而不是静默跳过关键能力。

## Acceptance Criteria

1. **能力分类不漂移：** 给定 curdx-flow 检查 companion capabilities，当读取 registry、plugin manifest 和 marketplace trust 时，`pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max` 必须被识别为 plugin dependencies；`context7`、`sequential-thinking` 必须被识别为 expected external MCP，不得被写入 plugin dependencies。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.2`; `_bmad-output/planning-artifacts/architecture.md#Capability Routing & Dependency Readiness`]
2. **依赖一致性 blocker：** 给定 plugin dependencies 被声明，当执行依赖一致性检查时，`src/registry/capabilities.ts`、`src/registry/plugins/*`、`plugins/curdx-flow/.claude-plugin/plugin.json`、repo-root `.claude-plugin/marketplace.json` allowlist、runner tests 必须一致；任一 marketplace id、plugin id 或版本声明漂移都必须生成 blocker。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.2`; `_bmad-output/planning-artifacts/prd.md#Release Gate & Plugin Self-Validation`]
3. **外部 MCP 可用性检测：** 给定外部 MCP 被期望可用，当 doctor 或 runtime planner 检查 `context7` 和 `sequential-thinking` 时，系统必须检测 configured/installed/callable 状态；不得自动把外部 MCP 当成 Claude plugin dependency 安装或发布。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.2`; `src/registry/mcps/context7.ts`; `src/registry/mcps/sequential-thinking.ts`]
4. **Plugin dependency 缺失降级：** 给定某个 plugin dependency 缺失、被禁用或 cross-marketplace trust 不满足，当用户运行验证或安装态 smoke 时，系统必须报告缺失能力、影响范围、remediation、是否阻塞当前任务；不得把依赖缺失场景标记为完整通过。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.2`; `_bmad-output/implementation-artifacts/2-1-capability-model-doctor-matrix.md#Review Findings`]
5. **External MCP fallback：** 给定某个 external MCP 不可用，当任务需要最新文档查询或高风险推理时，系统必须说明 fallback，例如使用本地缓存、人工确认或 blocked；涉及最新 Claude Code/plugin/MCP 行为时必须标记不确定或阻塞。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.2`; `_bmad-output/planning-artifacts/prd.md#Capability Routing & Dependency Readiness`]
6. **验证覆盖：** 给定 Story 2.2 完成，当执行验证时，最小验证命令必须包含 `npm run typecheck`、`npm run test:runner`、capability/dependency tests；如 plugin manifest 或 marketplace trust 变更，还必须运行 `npm run check-versions` 和 `claude plugin validate ./plugins/curdx-flow`。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.2`]

## Tasks / Subtasks

- [x] 固定 Story 2.2 范围和当前边界（AC: 1-6）
  - [x] 完整读取 Story 2.1 的实现和 review findings：`src/runtime/capabilities/**`、`tests/runtime/capabilities/capability-doctor.test.ts`、`src/hooks/lib/runtime-cli.ts`、`_bmad-output/implementation-artifacts/2-1-capability-model-doctor-matrix.md`。
  - [x] 完整读取依赖声明面：`src/registry/capabilities.ts`、`src/registry/plugins/*`、`src/registry/mcps/*`、`plugins/curdx-flow/.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json`、`tests/runner/capabilities.test.ts`。
  - [x] 明确本 story 只深化 plugin dependencies/external MCP readiness；不实现 Story 2.3 的 native `/goal` fallback、不实现 Story 2.5 remediation planner、不执行真实 install/update/uninstall、不发布、不打 tag。

- [x] 实现 dependency readiness facts 并接入 capability matrix（AC: 1-5）
  - [x] 在 `src/runtime/capabilities/**` 或等价 helper 中新增 deterministic parser/normalizer，把 plugin dependency 和 external MCP 的 configured/installed/callable/authorized/trust 状态映射成 `CapabilityStatus`。
  - [x] Plugin dependency facts 必须覆盖：manifest declared、registry expected marketplace/plugin id、repo marketplace allowlist、`claude plugin list --json` installed scope、enabled/disabled、version/unknown、trust mismatch、impact、remediation。
  - [x] External MCP facts 必须覆盖：expected external MCP、`claude mcp list` entry exists、connected/callable、missing/error/unknown、plugin-prefixed MCP 行必须排除为 plugin-provided server，不得当成 user external MCP。
  - [x] 对 fixture 输入支持 `CURDX_FLOW_PLUGIN_LIST_JSON` 或等价 env fixture、`CURDX_FLOW_MCP_LIST_OUTPUT`、probe timeout/non-zero/error，保证 tests 不依赖真实 `~/.claude`、真实 MCP、真实网络。
  - [x] 保持 Story 2.1 的 matrix contract：不删除字段，不把 unknown 当 available，不把 skipped deep check 当通过，允许 unknown future fields。

- [x] 加强 runtime doctor 输出和 blockers（AC: 2-5）
  - [x] `curdx-flow doctor` 默认 JSON 保持兼容，顶层旧字段继续存在；`capabilityMatrix` 中 plugin dependency/external MCP records 必须读新的 readiness facts。
  - [x] 缺失、disabled、trust mismatch、marketplace allowlist 缺失、plugin id 漂移必须进入 `blockers` 或 `degraded`，并说明 `blocksCompletion`/`blocksRelease`。
  - [x] external MCP missing/unavailable 必须输出 fallback：`context7` 影响 current docs evidence；`sequential-thinking` 影响 high-risk reasoning evidence；需要 latest Claude Code/plugin/MCP 行为时应 blocked 或 uncertain。
  - [x] 不要自动安装、更新、删除或 vendor external MCP/plugin dependencies；doctor 只检测和报告。

- [x] 更新 runner/dependency tests（AC: 1, 2, 6）
  - [x] 扩展 `tests/runner/capabilities.test.ts`，覆盖 registry、plugin manifest、marketplace allowlist、plugin registry modules 的 id/marketplace/pluginId 一致性。
  - [x] 增加断言：`context7`、`sequential-thinking` 不存在于 plugin manifest dependencies；它们只存在于 external MCP registry/tool capability surface。
  - [x] 增加 drift fixtures：marketplace id mismatch、allowlist missing、plugin id mismatch、external MCP 误建模，必须产生 failure/blocker。

- [x] 更新 capability/dependency runtime tests（AC: 3-6）
  - [x] 新增或扩展 `tests/runtime/capabilities/*`，覆盖 plugin list JSON：installed+enabled、installed+disabled、missing、malformed JSON、non-zero/timeout、unknown fields。
  - [x] 覆盖 external MCP：connected、missing、command error、plugin-prefixed MCP 被排除、malformed `claude mcp list` 输出。
  - [x] 覆盖 doctor JSON 默认兼容、`--human` 中 blocker/degraded/fallback/remediation 摘要、matrix guard 对新增 readiness fields 的兼容。
  - [x] 测试使用 `mkdtemp` workspace 和 env fixtures，不读取真实用户 plugin/MCP 状态，不在仓库根写 `.curdx/**` 或 `specs/**`。

- [x] 更新 generated runtime、验证和 story 记录（AC: 6）
  - [x] 如果 `src/hooks/lib/runtime-cli.ts` 或其 imports 变化，运行 `npm run build:hooks` 和 `npm run check:hooks-fresh`，提交 generated `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs(.map)`。
  - [x] 运行 `npm run typecheck`、capability/dependency targeted tests、`npm run test:runner`、`npm run test:hooks`（若 runtime bundle 变化）、`npm run verify`。
  - [x] 若触碰 plugin manifest、marketplace trust、registry dependency shape 或 plugin-facing runtime 行为，运行 `npm run check-versions`、`claude plugin validate ./plugins/curdx-flow`、`CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`。
  - [x] 在 Dev Agent Record 记录实现计划、验证命令、文件列表、review findings 和任何明确 deferred scope。

## Dev Notes

### 当前发现

- Story 2.1 已建立 `CapabilityStatus` / `CapabilityMatrix` / `probeCommand` / `renderCapabilityMatrix` / `validateCapabilityMatrix`，并把 `curdx-flow doctor` 默认 JSON 接入 `capabilityMatrix`；Story 2.2 应扩展 facts，不要另建第二套 contract。[Source: `src/runtime/capabilities/types.ts`; `src/runtime/capabilities/doctor.ts`; `_bmad-output/implementation-artifacts/2-1-capability-model-doctor-matrix.md#Completion Notes List`]
- Story 2.1 review 已修正关键语义：configured-but-unverified 不得标 `available`，skipped deep checks 不得让 human Overall 显示 ready，degraded release blocker 必须进入 blockers，guard 必须覆盖 `summary` 和 `nextActions`。[Source: `_bmad-output/implementation-artifacts/2-1-capability-model-doctor-matrix.md#Review Findings`]
- 当前 `pluginDependencyDoctor()` 只检查 manifest declaration、marketplace match、cross-marketplace allowlist 和 versionConstraint；没有读取 `claude plugin list --json` 的 installed/enabled/scope/version，也没有把 disabled/missing/trust mismatch 细化进 capability facts。[Source: `src/hooks/lib/runtime-cli.ts#pluginDependencyDoctor`]
- 当前 `externalMcpDoctor()` 通过 `claude mcp list` 或 `CURDX_FLOW_MCP_LIST_OUTPUT` regex 判断 configured/missing；它不区分 connected/error/callable，不表达 installed/callable/authorized，也没有过滤 plugin-prefixed MCP 行作为 external MCP 禁止项之外的显式测试。[Source: `src/hooks/lib/runtime-cli.ts#externalMcpDoctor`; `src/runner/state.ts#listMcp`]
- `src/runner/state.ts` 已有 async helpers：`listPlugins()` 解析 `claude plugin list --json` 的 `id/version/scope/enabled`，`listMcp()` 解析 `claude mcp list` 并跳过 `plugin:` 前缀；runtime-cli 目前是 sync command surface，若要复用需谨慎处理 async 边界或提取纯 parser。[Source: `src/runner/state.ts`]
- `tests/runner/capabilities.test.ts` 目前只覆盖 manifest dependency alignment、frontend alias、CLAUDE.md rendering；Story 2.2 应把 registry plugin modules、external MCP 非依赖关系和 drift blocker 也纳入测试。[Source: `tests/runner/capabilities.test.ts`]
- Plugin manifest 当前 dependencies 只有 `pua@pua-skills`、`claude-mem@thedotmack`、`chrome-devtools-mcp@chrome-devtools-plugins`、`ui-ux-pro-max@ui-ux-pro-max-skill`；repo-root marketplace allowlist 与这四个 marketplace 对齐。[Source: `plugins/curdx-flow/.claude-plugin/plugin.json`; `.claude-plugin/marketplace.json`]
- External MCP registry 当前是 `context7` 和 `sequential-thinking`，由 `src/registry/mcps/*` 安装/卸载；它们是 expected external MCP，不是 plugin manifest dependencies。[Source: `src/registry/mcps/context7.ts`; `src/registry/mcps/sequential-thinking.ts`; `src/registry/capabilities.ts`]

### Previous Story Intelligence

- Story 2.1 的 `CapabilityMatrix` 已经把 `pua`、`claude-mem`、`ui-ux-pro-max` 从 `CURDX_PLUGIN_DEPENDENCIES` 映射成 plugin-dependency records，`chrome-devtools-mcp` 当前由 browser status 处理；Story 2.2 需要避免重复/冲突，必要时让 chrome-devtools 既保留 plugin dependency trust fact，又保留 browser/Chrome runtime fact。[Source: `src/runtime/capabilities/doctor.ts#buildCapabilityMatrix`]
- Story 2.1 的 tests 已引入 `CURDX_FLOW_CAPABILITY_PROBES` fixture 和 generated runtime doctor JSON 回归测试；Story 2.2 应复用这个测试模式，并新增 plugin/MCP fixture，不依赖真实机器状态。[Source: `tests/runtime/capabilities/capability-doctor.test.ts`]
- Story 1.6 锁定 hook boundary：不要把依赖深检放进 hooks；doctor 可以 bounded 检测，但 hooks 仍应 cheap/fail-open。[Source: `_bmad-output/implementation-artifacts/1-6-hook-gate-only-completion-boundary-tests.md`]
- Story 1.5/1.4 建立 report/verdict 边界：dependency degraded/unavailable 只能作为 missing/degraded capability facts 供 report/planner/verdict 使用，不能单独解释为 completion verdict。[Source: `_bmad-output/implementation-artifacts/1-5-human-machine-readable-evidence-reports.md`; `_bmad-output/implementation-artifacts/1-4-completion-verdict-evaluator.md`]

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户知道 companion plugin / external MCP 缺失、禁用、trust mismatch 或不可调用时会影响什么能力。 |
| Primary Source | `src/runtime/capabilities/**` should remain the matrix/fact contract owner. |
| Runtime Integration | `src/hooks/lib/runtime-cli.ts doctor()` is plugin-local runtime integration; any source change requires `npm run build:hooks`. |
| Registry Source | `src/registry/capabilities.ts`, `src/registry/plugins/*`, `src/registry/mcps/*` are canonical dependency/external MCP declarations. |
| Plugin Manifest Surface | `plugins/curdx-flow/.claude-plugin/plugin.json` declares plugin dependencies only. |
| Marketplace Trust Surface | `.claude-plugin/marketplace.json` `allowCrossMarketplaceDependenciesOn` must include only required plugin dependency marketplaces. |
| Existing State Helpers | `src/runner/state.ts` has parsers/CLI helpers; prefer extracting pure parser logic over duplicating ad hoc parsing. |
| Fixtures | Env fixtures for plugin list JSON and MCP list output; no real user `~/.claude` dependency in unit tests. |
| Failure Modes | plugin missing, disabled, wrong scope, marketplace mismatch, allowlist missing, malformed plugin list JSON, external MCP missing, command error, plugin-prefixed MCP false positive, timeout. |
| Verification Commands | `npm run typecheck`, `npm run test:capabilities`, `npm run test:runner`, `npm run check:hooks-fresh`, `npm run test:hooks` if bundled runtime changes, `npm run verify`, `claude plugin validate ./plugins/curdx-flow`, `npm run test:claudecc` if doctor/smoke behavior changes. |

### Architecture Guardrails

- Do not move `context7` or `sequential-thinking` into `plugins/curdx-flow/.claude-plugin/plugin.json`; they are external MCPs, not plugin dependencies.[Source: `_bmad-output/planning-artifacts/architecture.md#Capability Routing & Dependency Readiness`]
- Do not auto-install or auto-update from doctor; detection/reporting belongs to doctor, install/update belongs to CLI install/update flows.[Source: `_bmad-output/planning-artifacts/architecture.md#Control Plane, Execution Plane, Display Plane`]
- Keep command execution as argv arrays and bounded timeouts; no shell-concatenated plugin/MCP probes.[Source: `_bmad-output/project-context.md#State & Process Safety`]
- Preserve default `curdx-flow doctor` JSON compatibility because `scripts/claudecc-smoke.mjs` parses it.[Source: `scripts/claudecc-smoke.mjs`; `_bmad-output/implementation-artifacts/2-1-capability-model-doctor-matrix.md#Known Risks To Prevent`]
- If adding fields to capability records, preserve unknown future field compatibility in `validateCapabilityMatrix()` and do not break Story 2.1 tests.[Source: `src/runtime/capabilities/doctor.ts#validateCapabilityMatrix`]
- Keep generated hook/runtime bundles source-first: edit TypeScript, then run `npm run build:hooks`; never hand-edit `plugins/curdx-flow/hooks/scripts/**`.[Source: `_bmad-output/project-context.md#Canonical Sources`]

### Latest Claude Code / Library Information

- Official Claude Code documentation entry remains <https://code.claude.com/docs/llms.txt>; plugin dependency behavior must be checked against current docs and the installed `claude` CLI before changing manifest/trust semantics.
- Official plugin dependencies docs at <https://code.claude.com/docs/en/plugin-dependencies> describe plugin dependencies as manifest-declared plugin relationships resolved through marketplaces. This supports Story 2.2's boundary: companion plugins go in manifest dependencies; expected external MCPs do not.
- `claude plugin list --json` is the installed plugin state surface used by existing `src/runner/state.ts`; `claude mcp list` remains text output and needs robust parser fixtures.

### Known Risks To Prevent

- Do not treat `plugin.dependencies.ready === true` as proof that dependencies are installed/enabled/callable; it currently only means declaration/trust alignment.
- Do not mark external MCP configured text match as fully available unless connected/callable evidence is present.
- Do not parse plugin-provided MCP lines (`plugin:<plugin>:<server>`) as expected external MCP.
- Do not make tests require real `claude plugin list`, real `claude mcp list`, real marketplaces, real Chrome, or network.
- Do not introduce release tag/publish/version bump work in this story.
- Do not widen plugin manifest dependencies to include external MCPs, and do not add plugin-local `.mcp.json` / `mcpServers` for expected MCPs.
- Do not weaken Story 2.1's review fixes: unknown/skipped must remain distinct from available, skipped deep checks must remain visible, and degraded release blockers must remain counted.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 2.2`
- `_bmad-output/planning-artifacts/epics.md#Story Requirement Trace`
- `_bmad-output/planning-artifacts/prd.md#Capability Routing & Dependency Readiness`
- `_bmad-output/planning-artifacts/prd.md#Release Gate & Plugin Self-Validation`
- `_bmad-output/planning-artifacts/architecture.md#Capability Routing & Dependency Readiness`
- `_bmad-output/planning-artifacts/architecture.md#Control Plane, Execution Plane, Display Plane`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/2-1-capability-model-doctor-matrix.md`
- `src/runtime/capabilities/doctor.ts`
- `src/runtime/capabilities/types.ts`
- `src/hooks/lib/runtime-cli.ts`
- `src/registry/capabilities.ts`
- `src/registry/plugins/*`
- `src/registry/mcps/*`
- `src/runner/state.ts`
- `tests/runner/capabilities.test.ts`
- `tests/runtime/capabilities/capability-doctor.test.ts`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>
- Claude Code plugin dependencies docs: <https://code.claude.com/docs/en/plugin-dependencies>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- RED phase:
  - `npm run test:runner` failed on missing readiness helper and missing chrome registry marketplace declaration.
  - `npm run test:capabilities` failed on missing readiness helper and chrome-devtools being overwritten by browser status.
- GREEN/refactor verification:
  - `npm run typecheck`
  - `npm run test:capabilities`
  - `npm run test:runner`
  - `npm run build:hooks`
  - `npm run check:hooks-fresh`
  - `npm run test:hooks`
  - `npm run verify`
  - `claude plugin validate ./plugins/curdx-flow`
  - `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`
- Code review patch verification:
  - `npm run typecheck`
  - `npm run test:capabilities`
  - `npm run test:runner`
  - `npm run check:hooks-fresh`

### Completion Notes List

- Added deterministic readiness normalizers for Claude plugin dependencies and external MCPs under `src/runtime/capabilities/readiness.ts`.
- `curdx-flow doctor` now feeds plugin dependency records from manifest/trust plus `claude plugin list --json`, including installed scope, version, enabled/disabled, trust drift, plugin id drift, blockers, and remediation.
- `curdx-flow doctor` now feeds external MCP records from parsed `claude mcp list` output, including connected/error/missing/unknown, callability, plugin-provided MCP exclusion, and fallback guidance for `context7` and `sequential-thinking`.
- Split `chrome-devtools-mcp` plugin dependency readiness from local browser runtime readiness by adding a separate `chrome-runtime` capability record.
- Extended runner tests to lock registry/package/manifest/marketplace classification and external MCP exclusion from plugin dependencies.
- Extended capability tests with plugin list fixtures, malformed/non-zero command handling, MCP connected/error/missing parsing, plugin-prefixed MCP exclusion, and generated runtime doctor compatibility.
- Code review patches resolved: doctor top-level `ok` now includes plugin dependency readiness; disconnected MCP status text no longer parses as connected; plugin/MCP probes no longer use login-shell fallback.
- Deferred by design: Story 2.3 native `/goal` fallback, Story 2.5 remediation planner, real install/update/uninstall actions, release publishing, and tag creation.

### File List

- `src/runtime/capabilities/readiness.ts`
- `src/runtime/capabilities/index.ts`
- `src/runtime/capabilities/doctor.ts`
- `src/hooks/lib/runtime-cli.ts`
- `src/registry/plugins/chrome-devtools-mcp.ts`
- `tests/runner/capabilities.test.ts`
- `tests/runtime/capabilities/capability-doctor.test.ts`
- `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs`
- `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs.map`
- `_bmad-output/implementation-artifacts/2-2-plugin-dependencies-external-mcp-readiness.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-17: Implemented plugin dependency and external MCP readiness facts, doctor matrix integration, focused drift/parser tests, generated runtime bundle refresh, and full verification.
- 2026-05-17: Addressed code review findings for doctor top-level readiness, MCP disconnected parsing, and argv-only plugin/MCP probes.

### Review Findings

- [x] [Review][Patch] Doctor top-level `ok` ignored plugin dependency readiness [src/hooks/lib/runtime-cli.ts:1202] — fixed by requiring `pluginDependenciesReady` and exposing it in diagnostics.
- [x] [Review][Patch] Disconnected MCP status text could be parsed as connected [src/runtime/capabilities/readiness.ts:330] — fixed by treating `Disconnected` / `Not connected` as error before connected matching.
- [x] [Review][Patch] Plugin/MCP readiness probes used login-shell fallback despite argv-array guardrail [src/hooks/lib/runtime-cli.ts:299] — fixed by keeping direct argv `spawnSync` probes and reporting command errors instead.
- Review outcome: Pass after patches; no unresolved decision-needed, patch, or deferred findings remain.

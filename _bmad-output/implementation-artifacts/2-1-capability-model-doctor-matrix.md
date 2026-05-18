# Story 2.1: Capability Model and Doctor Matrix

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为 curdx-flow 用户，
我希望 doctor 能清楚展示每项能力是 configured、installed、callable、authorized、degraded 还是 unavailable，
以便我不用猜当前环境能否支持真实验证、自动修复、浏览器诊断或发布门禁。

## Acceptance Criteria

1. **统一能力矩阵：** 给定 curdx-flow 在用户工作区运行 doctor，当 capability doctor 检测本地环境时，输出必须包含 Claude Code、Node/npm、package manager、Playwright/browser tools、plugin dependencies、external MCP、native `/goal`、hook freshness、plugin validation 相关能力的状态；每项能力必须区分 `configured`、`installed`、`callable`、`authorized`、`degraded`、`unavailable`，不能只显示“存在/不存在”。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.1`]
2. **不可调用降级：** 给定某个能力安装存在但不可调用，当 doctor 输出结果时，状态必须为 degraded 或 unavailable，并说明不可调用原因、影响哪些验证证据、是否阻塞完成或发布。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.1`]
3. **快速/深度检查边界：** 给定 doctor 在快速模式运行，当某项检查耗时较长、需要网络、需要外部交互或可能修改环境时，doctor 必须标记为 deep check 或 skipped-with-reason，不得把未执行的深度检查当作通过。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.1`; `_bmad-output/planning-artifacts/architecture.md#FR41-FR46 Capability Doctor`]
4. **JSON 与人类可读输出：** 给定 doctor 输出 human-readable 和 JSON 结果，当 JSON 结果被测试或 runtime 组件读取时，JSON 必须符合 capability/status schema 或 TypeScript guard；human-readable 输出必须让用户一眼看到 blocker、degraded capability、remediation 和 next action。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.1`; `_bmad-output/planning-artifacts/prd.md#Reporting & Review`]
5. **Planner/Report 可消费：** 给定能力状态被 runtime planner 或 report 读取，当能力处于 degraded 或 unavailable 时，planner/report 必须能引用该状态解释降级影响，不得静默跳过该能力要求。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.1`; `_bmad-output/planning-artifacts/architecture.md#Control Plane, Execution Plane, Display Plane`]
6. **验证覆盖：** 给定 Story 2.1 完成，当执行验证时，最小验证命令必须包含 `npm run typecheck`、capability doctor 单元/运行时测试和相关 runner tests；测试必须覆盖 installed-but-not-callable、unknown command、timeout/deep-check、JSON 输出 schema、human-readable blocker 摘要。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.1`]

## Tasks / Subtasks

- [x] 固定 capability doctor 范围和当前实现边界（AC: 1-6）
  - [x] 完整读取 `src/hooks/lib/runtime-cli.ts` 中 `doctor()`、`pluginDependencyDoctor()`、`externalMcpDoctor()`、`browserVerificationDoctor()`、`hookFreshnessDoctor()`、`pluginHealthDoctor()`、`releaseDoctor()`。
  - [x] 完整读取 `src/hooks/lib/tool-capabilities.ts`、`src/registry/capabilities.ts`、`src/registry/plugins/*`、`src/registry/mcps/*`、`tests/runner/capabilities.test.ts`。
  - [x] 完整读取 `plugins/curdx-flow/bin/curdx-flow` 和 `scripts/build-hooks.mjs`，确认 plugin-local runtime 由 `src/hooks/lib/runtime-cli.ts` bundle 到 `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs`。
  - [x] 明确 Story 2.1 只建立统一模型、doctor matrix、guard/schema、输出和测试；不实现 Story 2.2 的依赖一致性修复、Story 2.3 的完整 `/goal` fallback、Story 2.5 的 remediation planner、Story 6 的 release dry-run。

- [x] 设计并实现 capability status 合同（AC: 1, 2, 4, 5）
  - [x] 在 `src/runtime/capabilities/**` 或等价 runtime 目录新增 capability status 类型、builder、guard 和 renderer；如需要被 plugin-local runtime 使用，必须从 `src/hooks/lib/runtime-cli.ts` import 并通过 `npm run build:hooks` 打包进 generated runtime。
  - [x] 每个 capability record 至少表达：`id`、`label`、`category`、`provider`、`provisioning`、`checkMode`、`state`、`configured`、`installed`、`callable`、`authorized`、`degraded`、`unavailable`、`reason`、`evidenceImpact`、`blocksCompletion`、`blocksRelease`、`remediation`、`durationMs`。
  - [x] `state` 必须能清楚表达 `available`、`degraded`、`unavailable`、`skipped`、`unknown` 或等价枚举；维度字段必须能区分 configured/installed/callable/authorized，不能只靠单个 `ready` boolean。
  - [x] 如果新增 shipped schema，例如 `plugins/curdx-flow/schemas/capability-status.schema.json`，必须同步 `src/runtime/contracts/index.ts`、contract fixtures 和 `tests/contracts/runtime-contracts.test.ts`；如果选择 TypeScript guard 而非 schema，guard 必须有 focused tests。
  - [x] 合同必须允许 unknown future fields，保持 report/planner 未来扩展兼容。

- [x] 重构 doctor 输出为统一 matrix，保留兼容性（AC: 1-5）
  - [x] `curdx-flow doctor` 当前默认输出 JSON，且 `scripts/claudecc-smoke.mjs` 直接 `JSON.parse(doctor)`；不得破坏默认 JSON 兼容，除非同步更新 smoke、status skill 和所有调用点。
  - [x] 建议保留 `curdx-flow doctor` 默认 JSON，同时增加 `--json` 显式别名和 `--human` 或 `--format human` 输出；human 输出必须列出 blockers、degraded capabilities、skipped deep checks、remediation、next action。
  - [x] JSON 顶层应保留现有消费者依赖的字段：`ok`、`runtime`、`plugin`、`hookFreshness`、`release`、`externalMcp`、`browserVerification`、`diagnostics`、`warnings`、`executionBrief`；新增 `capabilityMatrix` 或等价字段，不要移除旧字段。
  - [x] `ok` 不能因为 skipped deep check 自动变 true；必须区分 `ready`、`degraded`、`blocked`、`unknown`，并用 `diagnostics` 暴露原因。
  - [x] `externalMcp`、`browserVerification`、`plugin.dependencies`、`hookFreshness`、`release` 等现有分散结果必须映射到统一 capability records，避免 UI/report/planner 读取两套不一致事实。

- [x] 覆盖关键能力类别（AC: 1, 2, 3, 5）
  - [x] Claude Code capability：检测 `claude` 命令是否 installed/callable；快速模式只做 bounded `claude --version` 或 env fixture，不做交互。
  - [x] Node/npm/package manager capability：检测 Node runtime、npm 或项目锁文件推断的包管理器；unknown command 必须变成 unavailable/degraded 并给出 remediation。
  - [x] Playwright/browser tools capability：基于 `package.json` scripts/dependencies/config、Chrome presence、Chrome DevTools MCP declaration，区分 project browser verifier ready、deep check skipped、installed-but-not-callable。
  - [x] Plugin dependencies capability：把 `pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max` 纳入 matrix；本 story 可先映射 declared/configured/install/callability evidence，但 marketplace trust drift 的完整治理留给 Story 2.2。
  - [x] External MCP capability：把 `context7`、`sequential-thinking` 纳入 matrix；不得把它们写成 plugin dependencies，不得自动安装，不得 vendor 或复制 MCP 行为。
  - [x] Native `/goal` capability：本 story 只纳入 matrix placeholder/fast detection surface；完整 version、hooks-disabled、manual fallback 细节留给 Story 2.3。
  - [x] Hook freshness 和 plugin validation capability：映射 `hookFreshnessDoctor()` 和 plugin validation readiness；不要在快速 doctor 中默认运行 `claude plugin validate`，应标记为 deep check/skipped 或用现有 smoke/validation evidence。

- [x] 提供可测试的 command probe/timeout/deep-check 机制（AC: 2, 3, 6）
  - [x] 新增或复用 deterministic command probe helper，使用 `spawnSync`/argv array、timeout、maxBuffer、durationMs、exitCode、stdout/stderr 摘要，不拼接 shell 字符串。
  - [x] 所有外部命令探测必须可由 env fixture 注入，避免 tests 依赖用户机器真实 Claude/MCP/Chrome/Playwright 状态。
  - [x] 快速模式不得执行网络、安装、浏览器启动、Playwright run、`claude plugin validate` 或 release tag remote checks；这些必须显示为 `checkMode: "deep"` + `skippedReason`，除非用户显式启用 deep。
  - [x] timeout、ENOENT、non-zero exit、malformed command output 必须转换成 degraded/unavailable record，不得抛出导致 doctor 崩溃。

- [x] 让 planner/report 能消费 degraded capability（AC: 5）
  - [x] 更新 `src/hooks/lib/tool-capabilities.ts`、`last-mile-orchestrator.ts`、`execution-brief.ts` 或 report 输入适配层时保持单向依赖：planner/report 消费 capability status，不拥有检查副作用。
  - [x] 不要让 capability matrix 覆盖 Story 1.4 的 `CompletionVerdict`；它只能提供 missing/degraded capability facts。
  - [x] 对关键能力缺失场景，输出必须说明影响哪些 evidence，例如 browser/API/data/docs/release evidence，而不是只显示 “missing”。
  - [x] 如果没有立即接入完整 report renderer，也必须在 JSON 中提供足够字段供 Story 2.6 报告 surface 消费。

- [x] 增加 tests 与 fixtures（AC: 1-6）
  - [x] 新增 `tests/runtime/capabilities/*` 或等价测试，覆盖 capability guard/schema、matrix builder、human renderer、command probe timeout/ENOENT/non-zero。
  - [x] 扩展 `tests/runner/capabilities.test.ts` 或新增 runtime doctor test，覆盖 plugin dependencies/external MCP classification 不漂移。
  - [x] 覆盖 installed-but-not-callable：例如 command exists fixture + non-zero callability result，必须输出 degraded/unavailable 和 evidence impact。
  - [x] 覆盖 unknown command：不存在的 `claude`/browser/MCP command 必须 degraded/unavailable，不得让 doctor 进程失败。
  - [x] 覆盖 timeout/deep-check：快速模式下深度检查必须 skipped-with-reason；显式 deep fixture timeout 必须 degraded/unavailable。
  - [x] 覆盖 JSON 输出 schema/guard 和 `curdx-flow doctor --human` blocker 摘要；默认 `curdx-flow doctor` JSON 兼容必须有回归测试。
  - [x] 测试使用 `mkdtemp` workspace 和 env fixtures；不得依赖真实用户 `~/.claude`、真实 MCP、真实 Chrome、真实 Playwright、真实网络或仓库根 `.curdx/**`。

- [x] 更新 generated runtime、验证和 story 记录（AC: 6）
  - [x] 如果 `src/hooks/lib/runtime-cli.ts` 或其 imports 变化，运行 `npm run build:hooks` 和 `npm run check:hooks-fresh`，提交对应 generated `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs(.map)` 变化。
  - [x] 运行 `npm run typecheck`、capability doctor targeted tests、`npm run test:runner`、`npm run test:hooks`（若 runtime-cli bundle 变化）、`npm run verify`。
  - [x] 若新增/修改 shipped schema、plugin-facing runtime 或 manifest-adjacent behavior，运行 `claude plugin validate ./plugins/curdx-flow`；若 doctor smoke 行为变化，运行 `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`。
  - [x] 在 Dev Agent Record 记录实现计划、验证命令、文件列表和任何未覆盖风险。

## Dev Notes

### 当前发现

- `plugins/curdx-flow/bin/curdx-flow` 是 plugin-local runtime 入口，它只 spawn `hooks/scripts/lib/runtime-cli.mjs`；因此 Story 2.1 修改 doctor runtime 时，实际 source 多半在 `src/hooks/lib/runtime-cli.ts` 或其 imports，必须通过 `npm run build:hooks` 更新 generated runtime bundle。[Source: `plugins/curdx-flow/bin/curdx-flow`; `scripts/build-hooks.mjs`]
- 当前 `runtime-cli.ts doctor()` 已输出 `runtime`、`plugin`、`hookFreshness`、`release`、`externalMcp`、`browserVerification`、`qualityGates`、`executionBrief`、`lastMile` 等 JSON，但这些结果是分散对象，不是统一 capability matrix。[Source: `src/hooks/lib/runtime-cli.ts`]
- 当前 `externalMcpDoctor()` 会调用 `claude mcp list`，支持 `CURDX_FLOW_MCP_LIST_OUTPUT` fixture；它只输出 configured/status，未表达 installed/callable/authorized/evidence impact。[Source: `src/hooks/lib/runtime-cli.ts`]
- 当前 `browserVerificationDoctor()` 检测 package scripts、Playwright config/dependency、Chrome presence 和 chrome-devtools-mcp declaration；它没有统一 degraded/unavailable/remediation 形状。[Source: `src/hooks/lib/runtime-cli.ts`]
- 当前 `pluginDependencyDoctor()` 检查 manifest declaration、marketplace match 和 cross-marketplace allowlist，但不检查 installed/callable/authorized；Story 2.2 会深化 plugin dependencies/external MCP readiness，本 story 先建立通用模型和 matrix surface。[Source: `src/hooks/lib/runtime-cli.ts`; `_bmad-output/planning-artifacts/epics.md#Story 2.2`]
- `src/hooks/lib/tool-capabilities.ts` 已有 recommendation-level availability（`available`/`expected`/`missing`/`workflow`）和 provisioning（`plugin-dependency`/`external-mcp`/`workflow`），但它不是 doctor truth；不要把 recommendation availability 当成实际 callability。[Source: `src/hooks/lib/tool-capabilities.ts`]
- `src/runtime/contracts/index.ts` 当前已有 evidence/state/session/adapterResult/completionVerdict/releaseVerdict/actionRiskPolicy/hookGate/artifactIndex/verificationReport，没有 capability status contract。[Source: `src/runtime/contracts/index.ts`]
- `tests/runner/capabilities.test.ts` 当前只覆盖 manifest dependency alignment、alias routing 和 CLAUDE.md rendering；Story 2.1 必须新增 doctor/matrix runtime coverage。[Source: `tests/runner/capabilities.test.ts`]
- `scripts/claudecc-smoke.mjs` 当前直接运行 plugin bin `curdx-flow doctor` 并 `JSON.parse` 默认输出；Story 2.1 不能把默认 doctor 输出改成人类文本而不更新 smoke 和 status skill。[Source: `scripts/claudecc-smoke.mjs`]

### Previous Story Intelligence

- Story 1.6 锁定 hook boundary：hooks 默认 fail-open，stdout 只输出 event-specific protocol JSON，Stop 不做 continuation loop。Story 2.1 的 doctor 不能把慢检查塞进 hooks，也不能让 hook gate 依赖实时 doctor 深度检查。[Source: `_bmad-output/implementation-artifacts/1-6-hook-gate-only-completion-boundary-tests.md#Review Findings`]
- Story 1.5 建立 report renderer，报告层只消费 state/evidence/verdict/blockers，不重新计算 truth。Capability matrix 应成为 report/planner 可消费事实源，但不替代 completion verdict。[Source: `_bmad-output/implementation-artifacts/1-5-human-machine-readable-evidence-reports.md`]
- Story 1.4 建立 no-false-completion verdict evaluator；能力 degraded/unavailable 只能影响 missing evidence/blocker 输入，不能被 doctor 单独解释为“任务完成”。[Source: `_bmad-output/implementation-artifacts/1-4-completion-verdict-evaluator.md`]
- Story 1.3 建立 workspace-local `.curdx/**` 边界；doctor tests 必须使用临时 workspace，不得在仓库根或真实用户目录写 runtime state。[Source: `_bmad-output/implementation-artifacts/1-3-run-state-recovery-context-workspace-boundary.md`]

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户不用猜能力是否可用、是否降级、缺失会影响什么证据。 |
| Runtime Directory | `src/runtime/capabilities/**` 或等价 runtime helper；plugin bin 集成点在 `src/hooks/lib/runtime-cli.ts`。 |
| Plugin Surface | `plugins/curdx-flow/bin/curdx-flow` 行为保持兼容；generated runtime bundle 由 `npm run build:hooks` 更新。 |
| Schema | 新增 capability-status schema 或 TypeScript guard；若 shipped schema 变化，同步 contracts/fixtures/tests。 |
| Contract Test | 新增或扩展 `tests/contracts/runtime-contracts.test.ts`，若选择 schema；否则 focused guard tests 必须覆盖 unknown fields 和 invalid enum/type。 |
| Runtime Test | 新增 `tests/runtime/capabilities/**` 或等价，覆盖 matrix builder、doctor JSON、human renderer、probe failure/deep skip。 |
| Adapter Test | 本 story 不调用真实 MCP/Playwright/browser；用 env fixtures/command probe mocks 验证 installed-but-not-callable。 |
| Fixture | `mkdtemp` workspace + env fixture strings，例如 mocked `claude mcp list`、mocked plugin list、mocked command probe output。 |
| Evidence Output | 仅输出 capability facts/evidence impact，不写 evidence ledger。 |
| Report Surface | JSON 提供 degraded/unavailable/evidenceImpact 给后续 report；human doctor 摘要可读。 |
| Failure Mode | unknown command、timeout、non-zero callability、malformed command output、deep-check skipped、missing external MCP、hook freshness stale。 |
| Verification Commands | `npm run typecheck`、capability tests、`npm run test:runner`、必要时 `npm run build:hooks`、`npm run check:hooks-fresh`、`npm run test:hooks`、`npm run verify`、`claude plugin validate ./plugins/curdx-flow`、必要时 `npm run test:claudecc`。 |

### Implementation Shape Guidance

建议 capability record 形态（可调整，但必须保留等价语义）：

```ts
interface CapabilityStatus {
  schemaVersion: 1;
  id: string;
  label: string;
  category: 'core' | 'package-manager' | 'browser' | 'plugin-dependency' | 'external-mcp' | 'hook' | 'plugin-validation' | 'release';
  provider: 'curdx-flow' | 'claude-code' | 'node' | 'npm' | 'playwright' | 'chrome' | 'mcp' | 'plugin';
  provisioning: 'core' | 'local-command' | 'plugin-dependency' | 'external-mcp' | 'project-script' | 'workflow';
  checkMode: 'fast' | 'deep' | 'skipped';
  state: 'available' | 'degraded' | 'unavailable' | 'skipped' | 'unknown';
  configured: boolean | 'unknown' | 'skipped';
  installed: boolean | 'unknown' | 'skipped';
  callable: boolean | 'unknown' | 'skipped';
  authorized: boolean | 'unknown' | 'skipped';
  reason: string;
  evidenceImpact: string[];
  blocksCompletion: boolean;
  blocksRelease: boolean;
  remediation: string | null;
  durationMs: number;
}
```

建议 doctor JSON 顶层增量：

```ts
{
  ok: boolean,
  capabilityMatrix: {
    schemaVersion: 1,
    generatedAt: string,
    cwd: string,
    mode: 'fast' | 'deep',
    summary: { blockers: number, degraded: number, unavailable: number, skippedDeepChecks: number },
    capabilities: CapabilityStatus[],
    blockers: CapabilityStatus[],
    degraded: CapabilityStatus[],
    nextActions: Array<{ capabilityId: string, action: string, priority: 'high' | 'medium' | 'low' }>
  },
  // keep existing runtime/plugin/hookFreshness/release/externalMcp/browserVerification fields
}
```

建议 human 输出结构：

```text
# curdx-flow Doctor

Overall: ready | degraded | blocked
Blockers: <count>
Degraded: <count>
Skipped deep checks: <count>

## Capability Matrix
<id>  <state>  configured=<...> installed=<...> callable=<...> authorized=<...>

## Evidence Impact
<capability>: affects <browser/API/docs/release/...>

## Next Actions
1. <remediation>
```

### Files To Read Before Editing

**UPDATE candidates:**

- `src/hooks/lib/runtime-cli.ts`
- `src/hooks/lib/tool-capabilities.ts`
- `src/hooks/lib/last-mile-orchestrator.ts`
- `src/hooks/lib/execution-brief.ts`
- `src/runtime/contracts/index.ts`（如新增 schema）
- `tests/contracts/runtime-contracts.test.ts`（如新增 schema）
- `tests/runner/capabilities.test.ts`
- `scripts/claudecc-smoke.mjs`（仅当 doctor 默认输出或 smoke expectations 改变）
- `plugins/curdx-flow/skills/status/SKILL.md`（仅当 status skill 的 doctor consumption/output 改变）

**READ for context:**

- `plugins/curdx-flow/bin/curdx-flow`
- `scripts/build-hooks.mjs`
- `src/registry/capabilities.ts`
- `src/registry/plugins/pua.ts`
- `src/registry/plugins/claude-mem.ts`
- `src/registry/plugins/chrome-devtools-mcp.ts`
- `src/registry/plugins/ui-ux-pro-max.ts`
- `src/registry/mcps/context7.ts`
- `src/registry/mcps/sequential-thinking.ts`
- `src/runtime/reports/renderer.ts`
- `src/runtime/verdict/index.ts`
- `_bmad-output/implementation-artifacts/1-6-hook-gate-only-completion-boundary-tests.md`

**NEW expected:**

- `src/runtime/capabilities/types.ts`
- `src/runtime/capabilities/doctor.ts`
- `src/runtime/capabilities/probes.ts`
- `src/runtime/capabilities/renderer.ts`
- `src/runtime/capabilities/index.ts`
- `tests/runtime/capabilities/capability-doctor.test.ts`
- Optional `plugins/curdx-flow/schemas/capability-status.schema.json`
- Optional contract fixtures under `tests/fixtures/contracts/**`

### Architecture Guardrails

- Capability doctor 属于控制面：检测、归一化和解释能力状态；不得执行安装、修复、浏览器验证、Playwright run、MCP tool calls 或 release publish/tag。[Source: `_bmad-output/planning-artifacts/architecture.md#Control Plane, Execution Plane, Display Plane`]
- `pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max` 是 plugin dependencies；`context7`、`sequential-thinking` 是 expected external MCP；curdx-flow 不得 vendor、复制或重实现它们。[Source: `_bmad-output/planning-artifacts/architecture.md#Capability Routing & Dependency Readiness`]
- 配置存在不等于真实可调用；doctor 必须区分 configured、installed、callable、authorized、degraded、unavailable。[Source: `_bmad-output/planning-artifacts/architecture.md#Capability doctor`]
- 关键能力不可用必须说明降级影响、fallback、可信度下降和是否需要人工确认；不得静默跳过关键证据。[Source: `_bmad-output/planning-artifacts/architecture.md#Degraded Mode Experience`]
- Hook 和 doctor 的职责分离：hooks 保持低延迟 gate-only；doctor 可以做 bounded 本地探测，但慢检查必须显式 deep/skipped。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-HOOK-001 Gate Only`]
- Plugin-local runtime 是 shipped product surface；任何 runtime-cli source 变化都必须通过 `npm run build:hooks` 更新 generated bundle。[Source: `_bmad-output/project-context.md`]

### Latest Claude Code / Library Information

- 官方 Claude Code 文档入口仍以 <https://code.claude.com/docs/llms.txt> 为准；本 story 涉及 plugin dependencies、MCP、hooks、`/goal`、plugin validation 和 installed plugin runtime，必须以当前官方 docs 与本机 `claude` CLI 为准。
- 官方 plugin dependencies docs 明确 plugin dependencies 是 manifest 声明和 marketplace 解析机制；Story 2.1 只把它们纳入 capability matrix，不在本 story 修改 dependency marketplace/version 语义。
- 官方 MCP/docs/debug surfaces 可能变化；实现时应通过 bounded CLI probes 和 env fixtures 保护 tests，不把用户机器特定状态写死。
- `claude plugin validate ./plugins/curdx-flow` 是插件结构验证面；快速 doctor 不应默认运行该命令，但 matrix 可以提示 deep validation command。

### Known Risks To Prevent

- 不要把 `curdx-flow doctor` 默认输出从 JSON 改成人类文本导致 `scripts/claudecc-smoke.mjs`、status skill 或用户脚本崩溃。
- 不要把 recommendation availability（`tool-capabilities.ts`）当成实际 installed/callable truth。
- 不要在 tests 中依赖真实 `claude mcp list`、真实 Chrome、真实 Playwright、真实网络或用户 `~/.claude`。
- 不要在快速 doctor 中运行长命令、安装命令、浏览器启动、Playwright suite、MCP tool calls、`claude plugin validate` 或 remote tag checks。
- 不要将 external MCP 写进 plugin dependencies；Story 2.2 会继续治理 plugin dependency/external MCP readiness。
- 不要把 degraded capability 自动解释为 completion verdict；只提供 missing/degraded capability facts 给 planner/report/verdict。
- 不要手改 generated `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs`；只通过 `npm run build:hooks` 生成。
- 不要引入新的 npm dependency 来做 schema/rendering，除非现有 Ajv/Vitest/Node API 无法满足。
- 不要碰 release tags、npm publish、plugin tag、version bump 或 marketplace metadata，除非实现中发现现有 tests 明确需要同步且 story scope 允许。

## Project Structure Notes

- Alignment: Story 2.1 接续 Epic 1 的 evidence/status/report/hook boundary。它把“能力是否可靠”做成 runtime fact，供后续 planner、report、remediation 和 release gate 读取。
- Detected conflict: 现有 `runtime-cli.ts doctor()` 已经比较大，直接继续塞所有能力逻辑会恶化维护性。建议把纯能力模型、probe、matrix builder、human renderer 移到 `src/runtime/capabilities/**`，`runtime-cli.ts` 只做 CLI 参数解析和集成。
- Backcompat note: `curdx-flow doctor` 默认 JSON 是已存在 smoke contract；如果要改变默认输出，必须同步修改 smoke/status skill，但本 story 更推荐新增 `--human`。
- Testability note: capability probe 必须可注入；真实环境探测可以作为集成 smoke，但单元/运行时测试必须完全 deterministic。

## References

- `_bmad-output/planning-artifacts/epics.md#Story 2.1`
- `_bmad-output/planning-artifacts/epics.md#Story Requirement Trace`
- `_bmad-output/planning-artifacts/prd.md#Capability Routing & Dependency Readiness`
- `_bmad-output/planning-artifacts/prd.md#Reporting & Review`
- `_bmad-output/planning-artifacts/architecture.md#Capability doctor`
- `_bmad-output/planning-artifacts/architecture.md#Control Plane, Execution Plane, Display Plane`
- `_bmad-output/planning-artifacts/architecture.md#Degraded Mode Experience`
- `_bmad-output/planning-artifacts/architecture.md#Story-to-Structure Mapping Contract`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/1-6-hook-gate-only-completion-boundary-tests.md`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>
- Claude Code plugin dependencies docs: <https://code.claude.com/docs/en/plugin-dependencies>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npx vitest run tests/runtime/capabilities` initially failed because generated `runtime-cli.mjs` had not been rebuilt yet; fixed by completing TS integration and running `npm run build:hooks`.
- `npm run typecheck` initially failed on `BuildCapabilityMatrixInput` export/type narrowing and `browserVerificationDoctor()` unknown typing; fixed with exported matrix input type and precise runtime-cli casts.
- Verification commands run:
  - `npm run typecheck`
  - `npm run test:capabilities`
  - `npm run build:hooks`
  - `npm run check:hooks-fresh`
  - `npm run test:runner`
  - `npm run test:hooks`
  - `npm run verify`
  - `claude plugin validate ./plugins/curdx-flow`
- `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`
- Code review follow-up verification after patch findings:
  - `npm run typecheck`
  - `npm run test:capabilities`
  - `npm run build:hooks`
  - `npm run check:hooks-fresh`
  - `npm run verify`
  - `claude plugin validate ./plugins/curdx-flow`
  - `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`

### Completion Notes List

- Added a unified capability model, command probe helper, matrix builder, TypeScript guard, and human renderer under `src/runtime/capabilities/**`.
- Integrated `curdx-flow doctor` with `capabilityMatrix` while preserving default JSON output and existing top-level fields consumed by smoke/status paths.
- Added `--human` / `--format human` doctor output for blockers, degraded/unavailable capabilities, evidence impact, skipped deep checks, remediation, and next actions.
- Added fast/deep boundaries: fast doctor skips native `/goal` deep detection and `claude plugin validate`; `--deep` runs bounded plugin validation through the same probe mechanism.
- Added deterministic capability tests covering guard compatibility, invalid contract values, command ENOENT, timeout, non-zero callability, JSON compatibility, human summary, and deep-check timeout behavior.
- Wired `npm run test:capabilities` into `npm run verify` so Story 2.1 regression coverage is part of the release-quality gate.
- No shipped schema was added for capability status; Story 2.1 uses a TypeScript guard that allows unknown future fields for report/planner expansion.
- Code review patch findings were resolved: configured-but-unverified capabilities no longer report `available`, skipped deep checks degrade human Overall, degraded release blockers are counted in `blockers`, and the TypeScript guard now validates `summary` and `nextActions`.
- Remaining intentionally deferred scope: plugin dependency installed/callable depth remains Story 2.2; full native `/goal` fallback/detection remains Story 2.3; remediation planner remains Story 2.5; release dry-run remains Story 6.

### File List

- `package.json`
- `src/hooks/lib/runtime-cli.ts`
- `src/runtime/capabilities/types.ts`
- `src/runtime/capabilities/probes.ts`
- `src/runtime/capabilities/doctor.ts`
- `src/runtime/capabilities/renderer.ts`
- `src/runtime/capabilities/index.ts`
- `tests/runtime/capabilities/capability-doctor.test.ts`
- `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs`
- `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs.map`
- `_bmad-output/implementation-artifacts/2-1-capability-model-doctor-matrix.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-05-17: Implemented capability doctor matrix, runtime CLI integration, focused capability tests, generated runtime bundle update, and verification wiring.
- 2026-05-17: Addressed code review findings for skipped/degraded capability semantics and guard coverage; re-ran full verify, plugin validation, and Claude Code smoke.

### Review Findings

- [x] [Review][Patch] Configured-but-unverified external MCP and Playwright candidates were over-reported as `available`; fixed by using `unknown`/`skipped` until callability is actually verified.
- [x] [Review][Patch] Human doctor Overall could show `ready` while deep checks were skipped; fixed by treating skipped deep checks as degraded in the human summary.
- [x] [Review][Patch] `degraded` capabilities with `blocksRelease=true` were omitted from the `blockers` aggregate; fixed blocker aggregation and added regression coverage.
- [x] [Review][Patch] `validateCapabilityMatrix()` did not validate `summary` and `nextActions`; fixed guard coverage and added invalid-summary/invalid-priority tests.
- Review outcome: Pass after patches; no unresolved decision-needed, patch, or deferred findings remain.

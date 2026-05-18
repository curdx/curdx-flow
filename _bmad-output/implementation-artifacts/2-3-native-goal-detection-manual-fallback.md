# Story 2.3: Native `/goal` 能力检测与 Manual Fallback

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为使用 curdx-flow 执行长任务的用户，
我希望系统能判断当前 Claude Code 环境是否支持 native `/goal`，并在不可用时给出可靠的 manual/resumable fallback，
以便长任务不会依赖错误的无人值守假设，也不会让 Stop hook 形成第二套续跑循环。

## Acceptance Criteria

1. **Native `/goal` readiness 输出完整：** 给定用户运行 `curdx-flow doctor --json` 或 goal bridge 相关命令，当系统检测 native `/goal` 能力时，输出必须包含 `supported`、`requiredVersion`、`detectedVersion`、`reason`、hooks/settings blockers、fallback action、condition length status；Claude Code 版本低于 `2.1.139` 时必须报告 `update-needed`，不得声称 `/goal` 可用。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.3`; Claude Code `/goal` docs: <https://code.claude.com/docs/en/goal>]
2. **Hooks/settings blocker：** 给定当前环境启用了 `disableAllHooks` 或 managed `allowManagedHooksOnly` 阻断 `/goal`，当 doctor 或 implement flow 读取环境状态时，native `/goal` 必须标记为 blocked 或 unavailable，并说明 `/goal` 依赖 hooks 系统，推荐 manual/resumable fallback。[Source: `_bmad-output/planning-artifacts/epics.md#AR17`; `_bmad-output/planning-artifacts/epics.md#CCR13`; Claude Code settings docs: <https://code.claude.com/docs/en/settings>]
3. **Completion condition 合同：** 给定系统生成 `/goal` completion condition，当 condition 被构造时，condition 必须包含 turn/time bound、transcript-visible evidence 要求、verifier command、exit code、missingEvidence、final verdict 要求；condition 必须遵守 4,000 字符上限，超限时应压缩并报告 warning。[Source: `_bmad-output/planning-artifacts/epics.md#AR15`; `_bmad-output/planning-artifacts/epics.md#AR16`; Claude Code `/goal` docs: <https://code.claude.com/docs/en/goal>]
4. **默认 execution driver：** 给定 native `/goal` 可用，当 `/curdx-flow:implement` 或 runtime route 需要长任务执行驱动时，默认应推荐 `/goal` 作为 execution driver；Stop hook 只能做 gate/cleanup/evidence check，不得注入 continuation prompt。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-GOAL-001`; `_bmad-output/implementation-artifacts/1-6-hook-gate-only-completion-boundary-tests.md`]
5. **Manual/resumable fallback：** 给定 native `/goal` 不可用，当用户仍要执行 curdx-flow 流程时，系统必须提供 manual/resumable fallback，不得暗示无人值守继续执行仍然可用。[Source: `_bmad-output/planning-artifacts/epics.md#AR18`; `plugins/curdx-flow/skills/implement/SKILL.md#Step 4`]
6. **Transcript-visible evidence summary：** 给定 `/goal` evaluator 只能看到 transcript，当 runtime 输出 evidence summary 时，summary 必须包含简洁、脱敏、可见的 verifier evidence，不得要求输出原始日志、secret、MCP 响应或内存 payload 来满足 evaluator。[Source: `_bmad-output/planning-artifacts/epics.md#CCR14`; `_bmad-output/planning-artifacts/architecture.md#IP-GOAL-002`]
7. **验证覆盖：** 给定 Story 2.3 完成，当执行验证时，最小验证命令必须包含 `npm run typecheck`、goal capability/goal bridge tests、相关 hook tests；测试必须覆盖 supported version、update-needed、hooks-disabled、condition length、manual fallback、Stop hook 不续跑。[Source: `_bmad-output/planning-artifacts/epics.md#Story 2.3`]

## Tasks / Subtasks

- [x] 固定 Story 2.3 范围和复用边界（AC: 1-7）
  - [x] 完整读取并复用 `src/hooks/lib/goal-bridge.ts`、`src/hooks/lib/runtime-cli.ts`、`src/runtime/capabilities/**`、`src/hooks/stop-watcher.ts`、`tests/hooks/hook-boundary.test.ts`、`tests/runtime/capabilities/capability-doctor.test.ts`。
  - [x] 明确本 story 只实现 native `/goal` readiness、goal bridge fallback、condition contract 和 Stop hook 不续跑回归；不实现 Story 2.4 report-only/fix mode，不实现 Story 2.5 remediation planner，不引入非交互 `claude -p "/goal ..."` 自动执行，不发布、不打 tag。
  - [x] 保持 Story 2.1/2.2 capability matrix 兼容：新增字段允许 unknown future fields，不删除现有 `capabilityMatrix`、`diagnostics`、`plugin`、`externalMcp`、`browserVerification` 等 JSON 顶层字段。

- [x] 实现 native `/goal` readiness pure helper（AC: 1, 2, 5）
  - [x] 在 `src/runtime/capabilities/**` 新增 `goal-readiness.ts` 或等价 helper，并从 `src/runtime/capabilities/index.ts` 导出。
  - [x] Helper 输入应支持 deterministic fixtures：Claude version probe output、settings JSON/source facts、condition length facts；单元测试不得依赖真实 `~/.claude`、真实 project `.claude`、真实网络或真实 `/goal` 执行。
  - [x] 解析 `claude --version` 输出，例如 `2.1.143 (Claude Code)`，与最低版本 `2.1.139` 比较；低于最低版本输出 `state: "update-needed"` 或等价 unavailable 状态，`supported: false`，并给出升级 remediation。
  - [x] 版本不可解析或 `claude` 不可调用时输出 `supported: false | "unknown"`、`detectedVersion: null`、明确 reason，不得把 unknown 当 available。
  - [x] 检测 settings blockers：`disableAllHooks === true`、managed `allowManagedHooksOnly === true` 必须进入 blockers，native `/goal` 标记 blocked/unavailable；fallback action 必须指向 manual/resumable mode。
  - [x] 不在 readiness helper 中运行 `/goal`、不调用模型、不读取 transcript、不写 `.curdx/**`。

- [x] 接入 capability matrix 和 `curdx-flow doctor`（AC: 1, 2, 4, 5）
  - [x] 将 `BuildCapabilityMatrixInput` 扩展为可接收 native goal readiness facts，替换当前 `staticStatuses()` 中 `native-goal` 的 Story 2.3 placeholder。
  - [x] `native-goal` capability record 必须表达：`state`、`configured`、`installed`、`callable`、`authorized`、`reason`、`evidenceImpact`、`blocksCompletion`、`blocksRelease`、`remediation`，并保留 capability guard 兼容。
  - [x] `runtime-cli.ts doctor()` 需要先复用同一个 `claudeProbe` 构建 readiness，再把 `claudeProbe` 和 `nativeGoal` 传给 matrix，避免对 `claude --version` 做重复探测。
  - [x] JSON 顶层新增 `nativeGoal` 或等价对象，`diagnostics` 增加 `nativeGoalReady`/`goalExecutionDriver` 等可消费字段；默认 `curdx-flow doctor` 仍输出 JSON，`--human` 仍可渲染 matrix。
  - [x] 当 native `/goal` blocked/update-needed 时，不应让 doctor 暗示 unattended execution 可用；但仅 `/goal` 不可用不应破坏 manual/resumable 的基本 CLI 可用性。

- [x] 加强 goal bridge contract（AC: 1, 3, 4, 5, 6）
  - [x] `src/hooks/lib/goal-bridge.ts` 应输出 readiness/fallback 信息，例如 `readiness`、`recommendedDriver: "native-goal" | "manual-resume"`、`fallbackAction`、`conditionLength`，或等价结构。
  - [x] `/goal` 可用时 `startPrompt` 默认推荐运行 `slashCommand`；不可用时 `startPrompt` 明确进入 manual/resumable fallback，不得声称无人值守继续执行。
  - [x] `condition` 必须显式包含：turn/time bound、transcript-visible evidence、final verifier command、exit code 0、`missingEvidence` 为空或被解释、final verdict/last-mile gate 无 blocker。
  - [x] `condition` 仍保留 `ALL_TASKS_COMPLETE` 的可见输出规则，但不得把 marker 本身当作唯一完成证据。
  - [x] 4,000 字符上限必须结构化记录：`limit`、`actual`、`status: "within-limit" | "compressed"` 或等价字段；压缩时 warnings 必须可测试。
  - [x] Evidence summary 只写安全摘要和路径，不要求原始日志、secret、MCP payload、memory payload 或完整请求响应进入 transcript。

- [x] 更新 implement/help skill 的用户面约束（AC: 4, 5）
  - [x] `plugins/curdx-flow/skills/implement/SKILL.md` 的 Step 4 必须消费新的 goal bridge readiness：native goal available 时才推荐 `/goal`，否则自动走 `--manual` 等价流程并留下 resumable next action。
  - [x] `plugins/curdx-flow/skills/help/SKILL.md` 的 recovery 文案保持一致：Goal unavailable 时使用 manual resume，不把 Stop hook 描述为执行循环。
  - [x] 如只需调整文案，保持 frontmatter、command names、marker strings 和 `disable-model-invocation: true` 不变；不要重写整份 skill。

- [x] 保持 Stop hook gate-only 并补足回归（AC: 4, 7）
  - [x] `src/hooks/stop-watcher.ts` 现有注释和行为已经说明 native `/goal` 是执行驱动，Stop 不注入 continuation prompt；实现时不要重新引入 continuation prompt。
  - [x] 扩展 `tests/hooks/hook-boundary.test.ts` 或新增 focused hook test：当 state `executionDriver: "goal"` 或 `"manual"` 且任务未完成时，Stop hook stdout 不包含 continuation prompt、不启动 planner、不运行 Playwright/dev server/MCP。
  - [x] 如果 stop watcher source 未变化，可只保留/扩展 tests；如 source 变化，必须运行 `npm run build:hooks` 和 `npm run check:hooks-fresh`。

- [x] 增加 goal readiness/goal bridge tests（AC: 1-7）
  - [x] 新增或扩展 runtime capability tests，覆盖：`2.1.143`/`2.1.150` supported、`2.1.138` update-needed、malformed version unknown、`disableAllHooks` blocked、managed `allowManagedHooksOnly` blocked。
  - [x] 覆盖 `condition` 长度：普通 condition `within-limit`，超长 goal/spec input 被压缩并记录 warning，最终 length `<= 4000`。
  - [x] 覆盖 manual fallback：goal bridge 在 blocked/update-needed/unknown 时推荐 manual/resume，不推荐 native unattended execution。
  - [x] 覆盖 generated runtime CLI：`curdx-flow goal` 和 `curdx-flow doctor` JSON 包含 native goal readiness fields；测试使用 `mkdtemp` workspace 和 env fixtures。
  - [x] 保持 `tests/runtime/capabilities/capability-doctor.test.ts` 的 existing fixtures 不读取真实用户配置；新增 fixtures 可使用 `CURDX_FLOW_CAPABILITY_PROBES` 和新的 goal settings env fixture。

- [x] 更新 generated runtime、验证和 story 记录（AC: 7）
  - [x] 若触碰 `src/hooks/lib/runtime-cli.ts`、`src/hooks/lib/goal-bridge.ts` 或其 imports，运行 `npm run build:hooks`，提交 generated `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs(.map)` 及相关 generated bundle。
  - [x] 运行 `npm run typecheck`、goal readiness/goal bridge targeted tests、`npm run test:capabilities`、相关 hook tests、`npm run check:hooks-fresh`。
  - [x] 如果 plugin-facing runtime 或 skill 文案变化，运行 `claude plugin validate ./plugins/curdx-flow`；如果 `scripts/claudecc-smoke.mjs` 覆盖的 runtime JSON 变化，运行 `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`。
  - [x] 在 Dev Agent Record 记录实现摘要、验证命令、文件列表、review findings 和任何明确 deferred scope。

## Dev Notes

### 当前发现

- 当前 `src/hooks/lib/goal-bridge.ts` 已有 `GOAL_CONDITION_LIMIT = 4000`、`compactCondition()`、`evidenceProtocol()` 和 `buildGoalBridge()`；它会生成 `/goal` condition、`slashCommand`、`startPrompt`、`evidenceProtocol`、`warnings`，但 readiness 目前只是 warning 文案，不检测 Claude version/settings blocker，也没有结构化 condition length status。[Source: `src/hooks/lib/goal-bridge.ts`]
- 当前 condition 已要求 task evidence、verifier command/exitCode、snapshot/last-mile 无 blocking gates、`ALL_TASKS_COMPLETE` 可见；仍需显式补上 `missingEvidence`、final verdict，以及结构化 fallback/driver 推荐。[Source: `src/hooks/lib/goal-bridge.ts#evidenceProtocol`]
- 当前 `src/runtime/capabilities/doctor.ts#staticStatuses()` 中 `native-goal` 是 Story 2.3 placeholder：`state: "skipped"`，reason 写明 full support detection 属于 Story 2.3。这个 placeholder 是本 story 的直接替换点。[Source: `src/runtime/capabilities/doctor.ts#staticStatuses`]
- 当前 `runtime-cli.ts doctor()` 已通过 `probeCommand({ id: "claude-version", command: claudeBin, args: ["--version"] })` 检测 Claude CLI，但 probe inline 传入 matrix；Story 2.3 应提取成变量复用，避免重复探测。[Source: `src/hooks/lib/runtime-cli.ts#doctor`]
- `probeCommand()` 已支持 `CURDX_FLOW_CAPABILITY_PROBES` fixture，可用 `claude-version` fixture 覆盖 supported/update-needed/malformed version；新增 settings blocker fixture 不应读取真实用户环境。[Source: `src/runtime/capabilities/probes.ts`]
- 当前 `plugins/curdx-flow/skills/implement/SKILL.md` 已描述 native `/goal` 默认执行驱动和 `--manual` fallback，但它没有基于 runtime readiness 分支；Story 2.3 应让该 skill 消费 goal bridge readiness，而不是只依赖人工判断。[Source: `plugins/curdx-flow/skills/implement/SKILL.md#Step 4`]
- 当前 `tests/hooks/hook-boundary.test.ts` 已覆盖 Stop hook 在 `executionDriver: "goal"` 时允许当前 turn 结束且不输出 continuation prompt；Story 2.3 可以复用并扩展为 manual fallback 场景。[Source: `tests/hooks/hook-boundary.test.ts`]
- 本机 `claude --version` 输出 `2.1.143 (Claude Code)`，高于 Story 2.3 要求最低版本 `2.1.139`；本地 smoke 可作为集成观察，单元测试仍必须使用 fixtures。[Source: local command `claude --version`, 2026-05-17]
- `claude plugin validate ./plugins/curdx-flow` 当前通过；Story 2.3 若改 skill/runtime-facing surface，应重新运行。[Source: local command, 2026-05-17]

### Previous Story Intelligence

- Story 2.1 建立 capability matrix、`CapabilityStatus`、`probeCommand()`、`renderCapabilityMatrix()` 和 `validateCapabilityMatrix()`；Story 2.3 必须扩展这套模型，不另建第二套 native goal status contract。[Source: `_bmad-output/implementation-artifacts/2-1-capability-model-doctor-matrix.md`; `src/runtime/capabilities/types.ts`; `src/runtime/capabilities/doctor.ts`]
- Story 2.2 新增 plugin dependency/external MCP readiness 并修复 `doctor.ok` 顶层语义；Story 2.3 新增 native `/goal` readiness 时，不要再让顶层 `ok` 绕过新的 readiness blocker，也不要把 manual fallback 场景误判为完整无人值守 ready。[Source: `_bmad-output/implementation-artifacts/2-2-plugin-dependencies-external-mcp-readiness.md#Review Findings`]
- Story 1.6 锁定 hook boundary：Stop hook 不注入 continuation prompt，TaskCompleted/PostToolBatch 可做缺证据 gate，hooks 不能成为 planner、长任务执行器或第二套 `/goal` loop。本 story 不得回退到 hook-driven continuation。[Source: `_bmad-output/implementation-artifacts/1-6-hook-gate-only-completion-boundary-tests.md`]
- Story 1.5/1.4 建立 report/verdict 边界：native goal readiness 只能提供 execution driver/capability facts；不能替代 completion verdict，也不能把 `ALL_TASKS_COMPLETE` marker 本身当作完成 truth。[Source: `_bmad-output/implementation-artifacts/1-5-human-machine-readable-evidence-reports.md`; `_bmad-output/implementation-artifacts/1-4-completion-verdict-evaluator.md`]

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| User Pain | 用户不用猜 native `/goal` 是否能无人值守驱动长任务；不可用时能明确转 manual/resumable。 |
| Runtime Directory | `src/runtime/capabilities/**` owns goal readiness facts; `src/hooks/lib/goal-bridge.ts` owns condition/driver contract. |
| Plugin Surface | `plugins/curdx-flow/bin/curdx-flow goal` and `curdx-flow doctor` expose readiness and fallback. |
| Schema / Contract | Extend existing TypeScript guard-compatible `CapabilityStatus`; optional dedicated `NativeGoalReadiness` type. |
| Contract Test | Goal readiness helper tests plus `validateCapabilityMatrix()` tests for native-goal records. |
| Runtime Test | Generated runtime CLI tests for `doctor` and `goal` JSON using `mkdtemp` + env fixtures. |
| Hook Test | Stop hook stdout remains empty for unfinished goal/manual turns; no continuation prompt. |
| Fixture | `CURDX_FLOW_CAPABILITY_PROBES` for `claude-version`; new env fixture for settings facts if file probing is added. |
| Evidence Output | Transcript-visible condition requires verifier command, exit code, missingEvidence, final verdict/gate summary. |
| Report Surface | `nativeGoal`/`capabilityMatrix` fields explain fallback action and condition length warning. |
| Failure Modes | version below 2.1.139, malformed version, missing `claude`, `disableAllHooks`, managed `allowManagedHooksOnly`, overlong condition. |
| Verification Commands | `npm run typecheck`, goal readiness/bridge tests, `npm run test:capabilities`, related hook tests, `npm run build:hooks`, `npm run check:hooks-fresh`, `claude plugin validate ./plugins/curdx-flow`, `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc` when relevant. |

### Architecture Guardrails

- `/goal` 是支持环境中的长任务控制入口；hooks 是确定性门禁、cleanup、状态保护和轻量 evidence check，不得形成第二套 continuation loop。[Source: `_bmad-output/planning-artifacts/epics.md#AR14`; `_bmad-output/planning-artifacts/architecture.md#IP-GOAL-001`]
- `/goal` evaluator 只能根据 transcript 可见内容判断完成；关键证据不能只存在于 hidden artifact。Condition 和 runtime summary 必须要求可见 verifier evidence。[Source: `_bmad-output/planning-artifacts/epics.md#AR15`; `_bmad-output/planning-artifacts/architecture.md#IP-GOAL-002`]
- `/goal` condition 必须包含 turn/time bound，并遵守 4,000 字符上限；压缩不能删除 no-false-completion、verifier、missingEvidence、final verdict 这些核心条件。[Source: `_bmad-output/planning-artifacts/epics.md#AR16`; Claude Code `/goal` docs: <https://code.claude.com/docs/en/goal>]
- `disableAllHooks` 或 managed `allowManagedHooksOnly` 阻断时必须报告 unattended goal execution blocker。不要用 Stop hook 或 shell loop 补一个隐藏自动续跑系统。[Source: `_bmad-output/planning-artifacts/epics.md#CCR13`]
- `/goal` evaluator 不运行工具、不读文件；verifier output、exit code、snapshot/last-mile gate status 必须进入 transcript 或报告，而不是只写本地 artifact。[Source: `_bmad-output/planning-artifacts/epics.md#CCR14`; Claude Code `/goal` docs: <https://code.claude.com/docs/en/goal>]
- Non-interactive `claude -p "/goal ..."` 可作为未来自动化候选；本 story 不引入，因为 version gating、cost bounds、redacted evidence policy 和 release gate 尚未完成。[Source: `_bmad-output/planning-artifacts/epics.md#CCR15`]
- Keep command probes as argv arrays with bounded timeout. Do not use login-shell fallback for `/goal` readiness, settings, plugin, MCP, git, npm, or filesystem checks。[Source: `_bmad-output/project-context.md#State & Process Safety`; Story 2.2 review findings]
- Generated hook/runtime bundles are source-first：修改 `src/hooks/**` 后只能通过 `npm run build:hooks` 更新 `plugins/curdx-flow/hooks/scripts/**`，不得手改 generated `.mjs`。[Source: `_bmad-output/project-context.md#Canonical Sources`]

### Latest Claude Code Information

- Official Claude Code `/goal` docs state `/goal` is available from Claude Code `2.1.139` onward; Story 2.3 must hard-gate older versions as update-needed instead of inferring support from command presence alone. Source: <https://code.claude.com/docs/en/goal>.
- Official `/goal` docs state completion conditions must fit the 4,000 character limit and the evaluator only checks the visible conversation; it does not run tools or inspect hidden files. Source: <https://code.claude.com/docs/en/goal>.
- Official `/goal` docs identify hook-related blockers: `disableAllHooks` and managed `allowManagedHooksOnly` make `/goal` unavailable. Source: <https://code.claude.com/docs/en/goal>.
- Official settings docs are the source for settings names, precedence, and managed policy behavior. Source: <https://code.claude.com/docs/en/settings>.
- Current local CLI observation on 2026-05-17: `claude --version` returned `2.1.143 (Claude Code)`, so local dev machine should pass the minimum version gate, but tests must not depend on this.

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/capabilities/types.ts`
- `src/runtime/capabilities/doctor.ts`
- `src/runtime/capabilities/index.ts`
- `src/hooks/lib/goal-bridge.ts`
- `src/hooks/lib/runtime-cli.ts`
- `plugins/curdx-flow/skills/implement/SKILL.md`
- `plugins/curdx-flow/skills/help/SKILL.md`
- `tests/runtime/capabilities/capability-doctor.test.ts`
- `tests/hooks/hook-boundary.test.ts`
- `scripts/claudecc-smoke.mjs` only if runtime JSON expectations change

**NEW expected:**

- `src/runtime/capabilities/goal-readiness.ts` or equivalent
- Focused goal readiness tests under `tests/runtime/capabilities/`

**GENERATED if source changes require it:**

- `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs`
- `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs.map`
- Any generated bundle corresponding to changed `src/hooks/lib/goal-bridge.ts` imports

### Known Risks To Prevent

- Do not claim `/goal` is available just because `claude --version` is callable; minimum version and hooks/settings blockers both matter.
- Do not treat unknown settings state as available. Unknown may allow manual/resumable work, but it must not advertise unattended `/goal` readiness.
- Do not run native `/goal` as a probe in tests or doctor; probing should be bounded CLI/version/settings reads, not model execution.
- Do not create a second continuation loop in Stop hook, shell scripts, or implement skill fallback.
- Do not let condition compression remove `missingEvidence`, verifier command/exit code, final verdict, or turn/time bound.
- Do not expose raw logs, secrets, MCP responses, memory payloads, cookies, tokens, or full request/response bodies in transcript-visible evidence.
- Do not break `curdx-flow doctor` default JSON output; existing smoke parses it with `JSON.parse`.
- Do not change plugin manifest/dependencies/marketplace identity for this story.
- Do not hand-edit generated hook bundles; regenerate through repo scripts.
- Do not update release tags, npm version, marketplace version, or publish artifacts in this story.

## Project Structure Notes

- Alignment: Story 2.3 completes Epic 2's native `/goal` row by replacing the matrix placeholder with real readiness and by turning `goal-bridge` from condition generator into an execution-driver contract.
- Existing good pattern: `src/runtime/capabilities/readiness.ts` from Story 2.2 shows the preferred shape for deterministic parsers with fixture-friendly inputs. Follow that pattern for goal readiness rather than adding ad hoc parsing inside `runtime-cli.ts`.
- Backcompat note: generated plugin runtime is the installed product path. Any source import added to `runtime-cli.ts` must bundle cleanly into `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs`.
- Testing note: Keep all tests isolated with `mkdtemp`; do not write real `.curdx/**`, `specs/**`, `~/.claude/**`, or project `.claude/**` from tests.

## References

- `_bmad-output/planning-artifacts/epics.md#Story 2.3`
- `_bmad-output/planning-artifacts/epics.md#Architectural Requirements`
- `_bmad-output/planning-artifacts/epics.md#Claude Code / Platform Constraints`
- `_bmad-output/planning-artifacts/prd.md#Technical Constraints`
- `_bmad-output/planning-artifacts/prd.md#Integration Requirements`
- `_bmad-output/planning-artifacts/architecture.md#API & Communication Patterns`
- `_bmad-output/planning-artifacts/architecture.md#Runtime Boundary Hardening`
- `_bmad-output/planning-artifacts/architecture.md#IP-GOAL-001 Native Goal First`
- `_bmad-output/planning-artifacts/architecture.md#IP-GOAL-002 Transcript-Visible Evidence`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/2-1-capability-model-doctor-matrix.md`
- `_bmad-output/implementation-artifacts/2-2-plugin-dependencies-external-mcp-readiness.md`
- `_bmad-output/implementation-artifacts/1-6-hook-gate-only-completion-boundary-tests.md`
- `src/hooks/lib/goal-bridge.ts`
- `src/hooks/lib/runtime-cli.ts`
- `src/runtime/capabilities/doctor.ts`
- `src/runtime/capabilities/probes.ts`
- `src/hooks/stop-watcher.ts`
- `plugins/curdx-flow/skills/implement/SKILL.md`
- `plugins/curdx-flow/skills/help/SKILL.md`
- `tests/runtime/capabilities/capability-doctor.test.ts`
- `tests/hooks/hook-boundary.test.ts`
- Claude Code `/goal` docs: <https://code.claude.com/docs/en/goal>
- Claude Code settings docs: <https://code.claude.com/docs/en/settings>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- RED phase:
  - `npm run test:capabilities` failed on missing `buildNativeGoalReadiness`, missing `nativeGoal` doctor fields, missing goal bridge readiness/conditionLength fields, and generated runtime CLI still using the old goal output.
  - Goal bridge compression initially preserved the generic turn-limit suffix but not the concrete `Stop after <n> goal turns` phrase; fixed by moving turn bound before the long user-goal context.
- GREEN/refactor verification:
  - `npm run test:capabilities`
  - `npm run typecheck`
  - `npm run test:hooks`
  - `npm run check:hooks-fresh`
  - `npm run test:runner`
  - `claude plugin validate ./plugins/curdx-flow`
  - `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`
  - `npm run verify`

### Completion Notes List

- Added native `/goal` readiness detection with minimum version gate `2.1.139`, settings blocker detection for `disableAllHooks` and managed `allowManagedHooksOnly`, explicit manual/resumable fallback, and condition length status.
- Replaced the `native-goal` capability matrix placeholder with real readiness facts and exposed `nativeGoal`, `diagnostics.nativeGoalReady`, and `diagnostics.goalExecutionDriver` from `curdx-flow doctor`.
- Updated `curdx-flow goal` / `goal-bridge` output with `readiness`, `recommendedDriver`, `fallbackAction`, and structured `conditionLength`.
- Strengthened `/goal` condition text to require transcript-visible verifier command, exit code, `missingEvidence`, final verdict/gate status, and concrete turn bound while preserving the 4,000 character limit through compression.
- Updated implement/help skill instructions so native `/goal` is recommended only when readiness says `native-goal`; otherwise manual resume is the supported fallback.
- Added tests for supported/update-needed/blocked native goal states, goal condition compression, generated runtime `goal`/`doctor` JSON, and Stop hook manual fallback no-continuation behavior.
- Deferred by design: non-interactive `claude -p "/goal ..."` automation, release gating changes, tag/publish/version work, and Story 2.4/2.5 mode/remediation planning.

### Change Log

- 2026-05-17: Implemented Story 2.3 native `/goal` readiness detection, manual fallback, goal bridge condition contract, capability matrix integration, skill guidance updates, generated runtime refresh, and full verification.
- 2026-05-17: Addressed code review finding for managed-only `allowManagedHooksOnly` detection; re-ran focused checks, plugin validation, Claude Code smoke, and full verify.

### Review Findings

- [x] [Review][Patch] Non-managed `allowManagedHooksOnly` settings were treated as native `/goal` blockers even though Claude Code documents that setting as managed-only; fixed blocker detection to require a managed settings source and added regression coverage.
- Review outcome: Pass after patch; no unresolved decision-needed, patch, or deferred findings remain.

### File List

- `src/runtime/capabilities/goal-readiness.ts`
- `src/runtime/capabilities/index.ts`
- `src/runtime/capabilities/doctor.ts`
- `src/hooks/lib/goal-bridge.ts`
- `src/hooks/lib/runtime-cli.ts`
- `plugins/curdx-flow/skills/implement/SKILL.md`
- `plugins/curdx-flow/skills/help/SKILL.md`
- `tests/runtime/capabilities/capability-doctor.test.ts`
- `tests/hooks/hook-boundary.test.ts`
- `plugins/curdx-flow/hooks/scripts/lib/goal-bridge.mjs`
- `plugins/curdx-flow/hooks/scripts/lib/goal-bridge.mjs.map`
- `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs`
- `plugins/curdx-flow/hooks/scripts/lib/runtime-cli.mjs.map`
- `_bmad-output/implementation-artifacts/2-3-native-goal-detection-manual-fallback.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

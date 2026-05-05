---
spec: state-completion-marker
phase: research
created: 2026-05-04T13:36:00Z
---

# Research: state-completion-marker

## Executive Summary

C 方案（保留 `.curdx-state.json` + `completed: true` 标记）落地代价**远小于风险**。整个改动核心是 5 个 prompt 站点（coordinator-pattern 两处 `rm -f`、implement.md 一处、cancel.md 仍删、`commit-discipline.md` 文档）+ 4 个 hook（stop-watcher 必须加 `completed` guard，否则**会回归出现 loop-restart**；update-spec-index/load-spec-context/quick-mode-guard 顺序加分支即可）+ schema 扩字段 + 模板/初始化补 `completed: false`。已有的 v7.0.2 fallback regex 修复**正交**，本 spec 不动它。Memory 观察 #406-414 已经把外部 SDD 工具（OpenSpec / Kiro / Spec-Kit）调研过一轮，外部研究**直接复用**，不消耗本次网络配额。版本号建议 **v7.1.0 (minor)**——读取语义从"file existence ⇒ in-progress"变成"`completed === true` ⇒ done"，是行为契约变更，不是单纯 bug fix。

## Codebase Inventory (Priority 1)

### A. 写入 / 删除 `.curdx-state.json` 的位置

| 文件:行号 | 当前操作 | 当前判断依据 | C 方案改动 | 颗粒度 |
|---|---|---|---|---|
| `plugins/curdx-flow/references/coordinator-pattern.md:79-82` | `rm -f "$SPEC_PATH/.curdx-state.json"` (Check Completion 段) | `taskIndex >= totalTasks` | 改为 `merge-state` 写 `{"completed":true,"completedAt":"<ISO>","awaitingApproval":false}` | trivial |
| `plugins/curdx-flow/references/coordinator-pattern.md:540-543` | `Delete .curdx-state.json (cleanup execution state)` (Native Sync Completion) | 同上 | 同上（同一个 ALL_TASKS_COMPLETE 路径，文档要去重避免再删） | trivial |
| `plugins/curdx-flow/references/coordinator-pattern.md:760-764` | `Delete .curdx-state.json` (PR Lifecycle Step 5) | epic 完成 | 同上 | trivial |
| `plugins/curdx-flow/commands/implement.md:152-166` | Step 5 Completion: `Delete .curdx-state.json` | 同 coordinator | 改为 merge `completed: true` + completedAt；保留 ephemeral 字段 (taskIndex/totalTasks 不归零，保审计) | trivial |
| `plugins/curdx-flow/commands/cancel.md:46-71` | `rm $spec_path/.curdx-state.json` 后整 spec dir 删 | 用户主动取消 | **保留 cancel 删除行为**（rm 整个 spec dir，state 一起没了）；不在 C 方案 scope | none |
| `plugins/curdx-flow/references/commit-discipline.md:70` | 文档说 `.curdx-state.json - never committed` | 文档 | 仍然成立（推 ensure-gitignore 是平行 spec），文案补一句"completed 状态下也保留" | trivial |
| `plugins/curdx-flow/commands/start.md:131-141` | `Initialize .curdx-state.json` 写 11 个字段 | 新建 spec | 模板增 `"completed": false`（默认值，简化下游判断） | trivial |
| `src/hooks/lib/init-execution-state.ts:22-36` (`EMBEDDED_TEMPLATE`) | 写嵌入式 template | 模板缺失 fallback | 加 `completed: false` 字段 | trivial |
| `plugins/curdx-flow/templates/.curdx-state.template.json` | **不存在**（init-execution-state 已有 fallback；start.md 直接 inline 写） | — | 可选：新建 template 文件 OR 维持 inline；推荐后者保持现状最小变动 | trivial / none |

### B. 读取 `.curdx-state.json` 的位置（关键：`completed` 字段判断）

| 文件:行号 | 当前 in-progress 判断依据 | C 方案改动 | 颗粒度 |
|---|---|---|---|
| `src/hooks/stop-watcher.ts:559-560` | `if (!existsSync(stateFile)) return;`（文件不存在 = 已完成，silent 放行） | **必改**：parse state 后 `if (state.completed === true) return;`，否则 fall through 进 continuation block 会触发 loop-restart 回归（observation #514） | **medium** — 是该 spec 风险最高的一处 |
| `src/hooks/stop-watcher.ts` `CurdxState` interface (~L70) | 11 字段无 `completed` | 加 `completed?: boolean; completedAt?: string;` | trivial |
| `src/hooks/stop-watcher.ts:601-606` | parse state 失败返回 corrupt block | parse 流程位于 transcript 检测之后（L591-599 检测 ALL_TASKS_COMPLETE），需要把 `completed` guard 插在 L607 之后、phase 检查之前 | trivial |
| `src/hooks/load-spec-context.ts:139-145, 191-210` | state 在 → 显示 phase + taskIndex/totalTasks；state 缺 → file-based fallback (else 分支 L192-209) | parse 后 `if (state.completed) { stderr: "Spec completed: <name>"; return INACTIVE | ContextBlock with completed:true }` | medium |
| `src/hooks/load-spec-context.ts:27-32` `CurdxState` interface | 4 字段（phase/taskIndex/totalTasks/awaitingApproval） | 加 `completed?: boolean` | trivial |
| `src/hooks/quick-mode-guard.ts:50-65` | parse state，看 `state.quickMode === true` 才 deny | 不动；C 方案下 completed spec 的 `quickMode` 不会变（true/false 都已固化），且完成态下不会再触发 AskUserQuestion 流程；保留现状 OK | none |
| `src/hooks/update-spec-index.ts:145-153` `readState()` | `existsSync` + parse；缺则 fallback `inferPhaseFromFiles` | parse 后增 `if (state.completed) phase="completed"`；不再依赖 markdown 反推（observation #406 根因消除） | medium |
| `src/hooks/update-spec-index.ts:278-294` `buildSpecRecord()` | 用 `state.phase` 当 phase 字段 | 改为 `state.completed ? "completed" : (state.phase ?? "unknown")`；保留 taskIndex/totalTasks 用于审计渲染 | medium |
| `src/hooks/update-spec-index.ts:390-415` `computeStatusCell` / `computePhaseCell` | 同上 | 同上：`completed` true → cell="done" | trivial（搭车上面） |
| `src/hooks/update-spec-index.ts:200-249` `inferPhaseFromFiles` | markdown 反推（fallback only） | **保留作为 second-tier fallback**（state 文件被人工删除 / 老版本残留 / index-state 失效场景）；不删 | none |
| `plugins/curdx-flow/commands/start.md:88-118` (Resume Flow) | `Read state; if no state → ask "Continue or restart?"`；state 在 → 接 phase 续作 | 加分支：`if state.completed === true → "This spec is completed (<completedAt>). Use /curdx-flow:refactor or create a new spec."` | trivial |
| `plugins/curdx-flow/references/spec-scanner.md:206-220` (Resume Flow) | 同 start.md | 同上 | trivial |
| `plugins/curdx-flow/commands/status.md:54` | `Read .curdx-state.json if exists` | parse 后展示 completed 标记 | trivial |
| `plugins/curdx-flow/commands/refactor.md:27, 112-117` | 读 state（read-only 上下文） | 不动；refactor 在 completed 之后 OK；可选：refactor 后清 `completed: false` 重新进入 tasks 阶段 | open question |
| `plugins/curdx-flow/commands/feedback.md:49` | 文案中提到 cancel cleanup 不彻底 | 不动，与 C 方案无关 | none |
| `plugins/curdx-flow/references/branch-management.md:113, 167-168` | worktree 启动时 cp state 文件 | 不动；cp 行为对 completed=true 同样适用 | none |
| `plugins/curdx-flow/references/quick-mode.md:70, 143, 174` | 写 state（discoveredSkills 之类） | 不动；这些都是非 completed 路径 | none |
| `plugins/curdx-flow/references/failure-recovery.md:89, 152, 165, 264, 324, 376` | 读/写 fixTaskMap、recoveryMode 等 | 不动；fix-task 走完后的 ALL_TASKS_COMPLETE 才会触达 completion | none |
| `plugins/curdx-flow/agents/spec-executor.md:13, 197` | 文档：`Never modify .curdx-state.json` | 不动 | none |
| `plugins/curdx-flow/agents/{architect-reviewer,product-manager,research-analyst,task-planner}.md` | `merge-state.mjs '{"awaitingApproval":true}'` | 不动 | none |

### C. 测试 fixture 写 state 的位置

| 文件:行号 | 当前 | C 方案 | 颗粒度 |
|---|---|---|---|
| `tests/hooks/_fixture-setup.ts:64-81` `DEFAULT_STATE` | 16 字段，无 `completed` | 加 `completed: false` 默认；新增 helper 写 completed-state 变体 | trivial |
| `tests/hooks/byte-equal.test.ts:155-180` "Completed spec" 固定 fixture | state 文件存在但 phase=execution、taskIndex=2/totalTasks=2（注意：现 fixture 实际是"刚完成但 state 还没删"的瞬间快照） | **改 fixture 加 `"completed": true, "completedAt": "..."`**；baseline JSON 全量重生成 | medium（baseline 文件会改） |
| `tests/hooks/update-spec-index.test.ts:107, 155` | `rmSync(.curdx-state.json)` 模拟 deletion-after-completion | **加新 case**：state 存在 + completed=true → phase="completed"，并保留旧 case 验证 fallback 仍能反推（保兼容） | medium |
| `tests/hooks/lib/init-execution-state.test.ts:7,35,52` | 验证写出 template | 加断言：写出的 JSON 包含 `"completed": false` | trivial |
| `tests/hooks/stop-watcher.test.ts:15-19` corrupt fixture | 不动 | 新增 test：state 存在 + completed=true → stop-watcher 不进 continuation block | medium |
| `tests/hooks/lib/ensure-gitignore.test.ts` | 已有 .curdx-state.json gitignore lib 测试 | 不动；ensure-gitignore wiring 是 observation #513 提到的另一个 spec scope | none |

### D. Schema 与文档

| 文件:行号 | 当前 | C 方案 | 颗粒度 |
|---|---|---|---|
| `plugins/curdx-flow/schemas/spec.schema.json:11` `required` | `["source","name","basePath","phase"]` | 不动；`completed` 是可选 | none |
| `plugins/curdx-flow/schemas/spec.schema.json:27-30` `phase` enum | `[research, requirements, design, tasks, execution]` | **不加 `"completed"` enum 值**；改用平行 boolean 字段，避免 phase 状态机变形 | none |
| `plugins/curdx-flow/schemas/spec.schema.json` properties block | 11 properties | 增 `completed: {type:"boolean"}`、`completedAt: {type:"string", format:"date-time"}` | trivial |
| `plugins/curdx-flow/skills/curdx-core/references/state-file-schema.md:13-22` | schema 文档 | 加两字段 + Phase 转换图末尾追"execution → completed (`completed: true`)" | trivial |
| `plugins/curdx-flow/commands/help.md:110` | `# Loop state (deleted on completion)` 注释 | 改为 `# Loop state (marked completed:true on completion, retained for audit)` | trivial |
| `docs/MIGRATION-V7.md:69, 82` | "v6 / v7 同 shape" | 加一条 v7.1.0 升级说明 | trivial |
| `CHANGELOG.md` | — | 加 v7.1.0 节，列 BREAKING（completion 语义变更，hook 老版本读不到 completed 字段会回退到 fallback——影响小但要记） | trivial |

### E. 总结：改动盘点

- **必改**：5 个 prompt 段（coordinator x3、implement、start.md 模板、init-execution-state EMBEDDED_TEMPLATE）+ 3 个 hook（stop-watcher、load-spec-context、update-spec-index）+ schema +  state-file-schema 文档。
- **不改**：quick-mode-guard、cancel、refactor、failure-recovery、quick-mode、branch-management、agents/*。
- **测试**：4 个 fixture/test 改动（_fixture-setup 加默认、byte-equal completed fixture、update-spec-index 新 case、stop-watcher 新 case）+ baseline JSON 重生成。
- **代码 LOC 估算**：hook .ts 改动 ~30 行 + prompt 改动 ~40 行 + schema/docs ~15 行 + tests ~80 行 = **≈170 LOC，外加 baselines diff**。

## Memory Observations (Priority 2)

复用 memory 已经做过的调研，**零网络成本**：

| Obs ID | 关键事实 | 对本 spec 的意义 |
|---|---|---|
| #406 | coordinator-pattern.md L542 删 state 在 update-spec-index L550 调用之**前**——index 永远走 fallback | 这是 v7.0.2 修补的根因；C 方案直接消除，不再依赖 fallback regex 反推 |
| #407 | `/- \[.\]/g` regex 把 AC checklist 误算成 task | v7.0.2 已用 OpenSpec 风格 anchored regex 修；C 方案让此 fallback 只在边缘场景被触达 |
| #408 | curdx-flow 没注册 PostToolUse hook，index 更新全靠 prompt 显式调用 | C 方案保持 prompt-driven 模型；不引入新 hook（reduce blast radius） |
| #411 | AWS Kiro 用 GFM `- [x]` 作 source-of-truth；GitHub Spec-Kit 用 `state.json` per run；BMAD 用独立 `workflow-status.md` | curdx-flow 选 JSON-as-truth 路线（与 Spec-Kit 同），C 方案进一步坚定该方向 |
| #412 | dbreunig.com SDD triangle：state 必须存在 agent 之外的机器可读 artifact 中 | C 方案合规——state 文件保留即 spec、code、test 三角中的 state 顶点 |
| #413 | OpenSpec：markdown checkbox 是 source of truth，CLI 反序列化为 JSON 输出；与 curdx-flow 路线相反 | curdx-flow 没采 OpenSpec 路线（task-planner 仍生成 `- [ ] 1.1` 而非纯 GFM），C 方案不改这部分 |
| #414 | OpenSpec regex `^[-*]\s*\[([ xX])\]\s*(.+)\s*$` 严格 anchor 在 bullet 前缀 | v7.0.2 已对齐；保留作为 secondary fallback，C 方案不动 |
| #415 | 测试基础设施完备：tests/hooks/ 有 fixture/baselines/_helpers.ts/_fixture-setup.ts | 新增 case 走现成 harness，不必造轮子 |
| #421 | v7.0.2 已发布到 main，commit `83efc8e` | 本 spec 是 v7.0.2 之上的下一步——确认无 race；新版本号从 v7.0.2 起算 |
| #425 | release workflow_run 触发失败模式（与本 spec 无关） | 排除，不影响本 spec |
| #508 | `.curdx-state.json` 没有 gitignore 处理；`commitSpec=true` 把它带进 git 历史 | C 方案不解决 gitignore——那是 observation #513 提到的"ensure-gitignore lib 已有但未 wire"的独立 spec；本 spec 只解决"completion 不再产生 deleted 状态"这一面 |
| #509 | 删除 .curdx-state.json 是 explicit plugin design（coordinator + implement 都明文要求） | C 方案是**故意推翻**这条设计决策，需在 spec 文档/CHANGELOG 明示理由（可审计性 + 工作树洁净 + index 不再依赖 fallback） |
| #510 | test008 commit `d1eda14` 把 requirements 阶段的 state 文件吃进了 git 历史；完成时删除产生未 commit 的 deleted 状态——工作树永久脏 | C 方案修复"删除产生 deleted"半边；另半边（不该 commit 进历史）需要 ensure-gitignore wiring（独立 spec）|
| #513 | `src/hooks/lib/ensure-gitignore.ts` 已有，但 spec 初始化（commands/start.md、init-execution-state）没调用它 | **out-of-scope** for 本 spec（goal 明示 not 引入 archive dir + 不动 schema 之外）；但写到 Open Questions：是否在本 spec 顺手 wire？ |
| #514 | stop-watcher.ts L559 `if (!existsSync(stateFile)) return;` 是当前"已完成"识别方式；C 方案下 completed spec 文件还在，会 fall through 进 continuation 块——必须加 `state.completed === true` guard | **本 spec 最关键风险**——design 阶段必须把 stop-watcher 的 guard 顺序写清楚 |

## Migration Risk (Priority 3)

### 已完成 spec 的状态

| Spec 路径 | 当前状态 | 风险 | 处理 |
|---|---|---|---|
| `/Users/wdx/opc/test008/specs/helloworld/.curdx-state.json` | git 历史里有 (commit `d1eda14`)，工作树 deleted 未 stage | 升级后再跑 `update-spec-index` 走 fallback infer "completed" 路径——**功能上不退化**，但 git 状态不会自愈（state 文件已被 rm 掉） | **不做 retroactive stub**；在 MIGRATION-V7.md 写一条手动恢复 snippet：`git checkout HEAD -- specs/<name>/.curdx-state.json && jq '. + {completed:true,completedAt:"..."}'` |
| `/Users/wdx/opc/curdx-flow/specs/cross-platform-support/` | state 已删除（spec 早就完成） | 同上；index 走 fallback infer "completed"（OK） | 同上；不必 retroactive |
| 新 spec（v7.1.0 后） | 全程持有 state 文件 | 0 风险 | — |

### 半途中断升级

场景：v7.0.2 用户在执行中（taskIndex=3/10）升级到 v7.1.0：
- state 文件存在、`completed` 字段缺失 → load-spec-context / stop-watcher 读到 `state.completed === undefined`，按 truthy 判断都 falsy，**走 in-progress 路径**（continuation prompt 正常出）。
- 推断动作：所有 `state.completed === true` 检查必须用 **`=== true` 严格判等**而非 `if (state.completed)`，避免 undefined 误判。
- 推断 design 必给：CurdxState interface `completed?: boolean` 用 `?` 标 optional，不强制。

### 测试 fixture 升级策略

- **增量**：`_fixture-setup.ts` 默认 `completed: false`；旧 test case 不用改即可继续 pass。
- **必改**：byte-equal "Completed spec" fixture（已经命名为 done-spec 但 state 仍是 phase=execution, taskIndex=2/2 的"未删瞬间"）—— 改成 phase=execution, taskIndex=2/2, completed=true, completedAt=fixed-ISO（baseline 重生）。
- **新增**：1 个 stop-watcher test（completed=true 不进 continuation）+ 1 个 update-spec-index test（completed=true → phase="completed" 不依赖 fallback）。

### Backwards-compat 推荐

- **DO**：所有 hook 读取兼容老格式（`completed === undefined` 视为 in-progress）。
- **DON'T**：不要在升级时自动给老 state 文件补 `completed: false`——无害但污染 git diff；交给下次 phase command 自然 merge。

## Test Infrastructure (Priority 4)

| 项 | 现状 |
|---|---|
| Runner | **vitest**（推断自 `tests/hooks/*.test.ts` 文件命名 + `_fixture-setup.ts` 中 `expect`/`afterEach`/`describe`/`it`，无 jest 痕迹；待 design 阶段 1-行确认 `package.json scripts.test`） |
| 已覆盖场景 | byte-equal（v6 baseline diff）、load-spec-context（active spec 上下文）、quick-mode-guard（quickMode 字段）、stop-watcher（continuation block + corrupt fallback）、update-spec-index（baseline + AC-checklist 不被误算 v7.0.2 case） |
| Fixture 工具 | `_fixture-setup.ts` 提供 `createFixtureSpec()` + 默认 state；`_helpers.ts` 跑 hook 子进程 |
| Baseline 路径 | `tests/hooks/baselines/v6.0.6/` 锁定 v6 byte-equal 输出；`fixtures/update-spec-index/` 锁定 v7 expectations |
| 缺口（C 方案要补） | (a) "completed=true → stop-watcher silent return"；(b) "completed=true → load-spec-context shows 'Spec completed' 提示而非 phase prompt"；(c) "completed=true → update-spec-index emits phase=completed 不读 markdown"；(d) "completed=true 的 spec 再次 invoke /curdx-flow:start 出 'spec is completed' 提示而不是 resume"（这个是 prompt-level 不易自动化，可作 manual VE 任务） |
| Quality commands（待 design 1 行确认） | 推断：`npm run typecheck && npm run build && npm test`（CLAUDE.md 的 Local dev 段印证）|

## Version Recommendation (Priority 5)

| 选项 | 理由 | 适配性 |
|---|---|---|
| **v7.0.3 (patch)** | 用户视角是 bug fix（"完成后的 spec 工作树干净 + index 不再依赖 fallback"） | 不推荐——同时改了 **state 文件契约**（添字段、读取语义），是行为变更，patch 容易让下游错以为 hot-fix 不需要 review |
| **v7.1.0 (minor)** ✅ | 新功能（新字段 `completed` / `completedAt`、新读取语义、新 hook guard），保 backwards-compat（老 state 文件仍可读、老 hook 读新 state 不挂） | **推荐**——对齐 semver "Added functionality in a backwards compatible manner" |
| v8.0.0 (major) | 没有 BREAKING（老 state 文件仍可被新 hook 处理；新 state 文件被老 hook 读会自动走 fallback 即 v7.0.2 行为） | 不推荐——杀鸡用牛刀，且 CLAUDE.md "默认 patch bump" 与用户偏好（feedback_version_bump_pace.md）冲突。但 design 阶段需向用户确认这个判断 |

> 用户 memory feedback 强调"默认 PATCH bump"——本 spec 因为同时碰了状态契约+读取语义，建议**升一档为 v7.1.0**，**design 阶段须向用户确认升 minor 不是 major**。

## External Research (Priority 6)

**直接 deferred** —— 上一轮研究 (memory obs #411-414) 已经覆盖：
- AWS Kiro: GFM checkbox 为 source of truth (markdown-as-truth)
- GitHub Spec-Kit: `state.json` per run (JSON-as-truth)
- OpenSpec: markdown checkbox + 严格 GFM regex 强制
- BMAD-Method: 独立 `workflow-status.md`
- dbreunig SDD triangle: 任何 state tracker 必须在 agent 外部

**结论已稳**：curdx-flow 走 JSON-as-truth 路线（与 Spec-Kit 同），C 方案是该路线的"完成态"语义补完。无新增网络查询必要。如果 design 阶段有新 SDD 工具值得对齐，再单独跑 1 次 WebSearch。

> 上一轮 research 死于 SSL/cert 错误（运行 7 分钟）——本轮采纳 "memory observations 优先 + 网络查询 ≤ 3 次" 限制，本轮**实际执行 0 次网络调用**，全程依赖代码 + 内存。

## Reverse Review / Open Questions (Priority 7)

### 隔壁组架构师会问的 3 个最尖锐问题

**Q1：你 retain state 文件就为了 audit `discoveredSkills` / `granularity` / `commitSpec`，但 `.progress.md` 里 Skill Discovery section 已经有这些信息了——为什么不只让 `.progress.md` 当 source of truth，state 文件该删就删？**

A：两点反驳：(1) `.progress.md` 是自由格式 LLM-written，没 schema 保证字段齐全（v7.0.2 update-spec-index 修复正是因为 markdown reverse-parse 不可靠）；structured JSON 保证字段一致性。(2) `index-state.json` 的 fallback 链路：state 文件 → markdown infer。如果 state 文件删除，fallback regex 任何边缘格式都可能误算。observation #406 + memory 观察 #514 已经实证。**反向锚定**：用户视角是"完成的 spec 不应该让工作树脏"，retain 文件是顺手解决；audit 价值是赠品。

**Q2：stop-watcher.ts L559 现在 `if (!existsSync(stateFile)) return;` 是 "completed = file gone" 的契约。改成 `if (state.completed === true) return;` 后，**老版本 hook（v7.0.2 ）+ 新版本 prompt（写了 completed=true 的 state）的混合场景** 会怎样？**

A：这是兼容矩阵核心问题：
- 老 hook（看 existsSync）+ 新 state（completed=true 但文件还在）→ existsSync=true，**fall through 进 continuation block**，prompt 输出"resume execution"——**回归**。
- 缓解：**npm 包是单一发行单元**（CLAUDE.md），`hooks/scripts/*.mjs` 与 `commands/*.md` 同 zip 同 install，不会半边新半边旧，**除非用户手动改文件**。
- 风险残留：第三方 fork 的 hook + 主线 prompt 升级。design 阶段建议在 hook 的 stderr 日志加一行 `[curdx-flow] state schema v=2 (completed marker)`，方便诊断。
- **必给的设计约束**：CurdxState interface `completed?: boolean` 严格 `=== true` 比对，避免 undefined 误判。

**Q3：完成后 `taskIndex`/`taskIteration`/`globalIteration`/`awaitingApproval` 这些 ephemeral 字段保留还是清零？保留导致 audit 价值（"我跑了 4 次 global iteration、taskIteration 在 task 5 卡了 3 次"），清零导致 schema 干净。这是**审计 vs 简洁** 的取舍——你选哪边，理由？**

A：**保留**，因为：
- (1) audit 价值具体（v7.1.0 后 用户随时可以 `cat .curdx-state.json | jq '.taskIteration'` 知道哪个任务最难收敛）。
- (2) 清零没收益——文件本就 retain，"看起来干净"靠 `completed: true` + UI 层不显示 ephemeral 字段即可（load-spec-context 的输出已是 stderr，不影响"干净"）。
- (3) `awaitingApproval: false` 应该归零——completion 时不再 await。
- 推断：`completed: true` 同时设 `awaitingApproval: false`，其余 ephemeral 字段保留。design 阶段须确认。

### 其他 Open Questions（design 阶段定）

1. **refactor 后是否清 `completed: false`**：用户跑 `/curdx-flow:refactor` 在 completed 之后修改 tasks，下次 implement 应该 resume——是否清 `completed: false`？倾向：**是**，并把 `completedAt` 删掉但**保留** `completedHistory: [{at: <ISO>, tasksAtCompletion: N}]`（design 决定要不要这层 history）。本 spec MVP 可以**不做** history，只重置 completed。
2. **是否 wire ensure-gitignore（observation #513）**：goal 明确 out-of-scope，但如果该 lib 已存在仅缺 1 行 wire，**顺手做** 让本 spec 覆盖完整端到端"工作树永久脏"问题。**建议放到 design 的 Open Questions 单独询问用户**。
3. **`completedAt` 是否必填**：optional 还是 required？倾向 optional（schema 允许缺；coordinator 总是写）；这样老 state 文件升级时无需 backfill。
4. **是否需要 epicCompleted 之类的 epic 层级 marker**：goal 没要求；epic 已经在 `.current-epic` + spec entry 里维护 status；**out-of-scope**。
5. **vitest 是否就是 runner**：design 阶段 1 行命令 `cat package.json | jq .scripts` 确认即可（CLAUDE.md 的 Local dev section 提了 `npm test` 但没指明 runner）。

## Recommendations for Requirements

1. **核心契约：`completed: boolean` 字段**——可选；coordinator/implement 在 ALL_TASKS_COMPLETE 路径上必写 `true`；schema 在 spec.schema.json 增 `completed` + `completedAt`。
2. **保 ephemeral 字段**：completion 时 ephemeral 字段（taskIndex/taskIteration/globalIteration）**保留原值**用于审计；只 `awaitingApproval` 归 false（避免下游 SessionStart 误以为还在 await）。
3. **stop-watcher 强制 guard**：所有 hook 用 `state.completed === true` 严格判等。
4. **保留 `inferPhaseFromFiles` 作为 second-tier fallback**：state 文件被人工删除时仍能反推（reduce regression surface）。
5. **schema 不动 phase enum**：用平行 boolean，不改 phase 状态机。
6. **不引入 archive dir / 不重构 .progress.md**：goal 明示 out-of-scope。
7. **prompt 改动文档化**：coordinator-pattern.md 三处删除全部改为 merge-state；implement.md Step 5 同步；help.md 注释更新；MIGRATION-V7.md + CHANGELOG.md 记一笔。
8. **测试新增 ≥ 3 case**：stop-watcher completed-guard、update-spec-index completed-phase、re-invoke-after-completion behavior。
9. **版本号 v7.1.0**：minor bump，保兼容；design 阶段向用户确认。
10. **保留 cancel.md `rm` 行为**：cancel 删整个 spec dir，不在本 spec scope 内修改。

## Sources

### 代码
- `src/hooks/update-spec-index.ts` (L1-472)
- `src/hooks/quick-mode-guard.ts` (L1-66)
- `src/hooks/load-spec-context.ts` (L1-222)
- `src/hooks/stop-watcher.ts` (L540-660，特别 L559-560 早返回点)
- `src/hooks/lib/init-execution-state.ts` (L1-88, EMBEDDED_TEMPLATE)
- `tests/hooks/_fixture-setup.ts` (L64-81 DEFAULT_STATE)
- `tests/hooks/byte-equal.test.ts` (L155-180 完成 spec fixture)
- `tests/hooks/update-spec-index.test.ts`、`stop-watcher.test.ts`、`lib/init-execution-state.test.ts`、`lib/ensure-gitignore.test.ts`
- `plugins/curdx-flow/schemas/spec.schema.json` (L1-30 properties, L300+ phase enum)

### Prompt / 文档
- `plugins/curdx-flow/references/coordinator-pattern.md` (L25-43, L75-85, L530-559, L750-770 三处 deletion site)
- `plugins/curdx-flow/commands/implement.md` (L138-167 Step 5 Completion)
- `plugins/curdx-flow/commands/cancel.md` (L40-110)
- `plugins/curdx-flow/commands/start.md` (L88-141 Resume + New Flow)
- `plugins/curdx-flow/commands/{requirements,design,tasks,research,refactor,status,switch,help,new}.md`
- `plugins/curdx-flow/references/{spec-scanner,branch-management,commit-discipline,failure-recovery,quick-mode}.md`
- `plugins/curdx-flow/skills/curdx-core/references/state-file-schema.md`
- `docs/MIGRATION-V7.md`、`CHANGELOG.md`、`CLAUDE.md`

### Memory（claude-mem）
- 核心：#406（root cause 顺序 bug）、#407（fallback regex 误算 AC）、#408（无 PostToolUse hook）、#411-414（外部 SDD 工具调研）、#415（测试基础设施）、#421（v7.0.2 已发）、#508（无 gitignore）、#509（删除是显式 design）、#510（test008 git 历史现场）、#513（ensure-gitignore lib 已有但未 wire）、#514（stop-watcher early return 风险）

### 外部（deferred，复用 memory）
- AWS Kiro / GitHub Spec-Kit / OpenSpec / BMAD-Method / dbreunig SDD triangle —— 见 obs #411-414

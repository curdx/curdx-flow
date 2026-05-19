# Features Gap-Fill Research：curdx-flow vs Claude Code 生态 2026-05

> 日期：2026-05-18
> 模式：**Gap-fill**。SYNTHESIS.md 已覆盖来自 4 仓库（ECC / GSD / superpowers / smart-ralph）的 7 个簇（A-G）。
> 本文聚焦：**Claude Code 官方 2026-02 至 2026-05 的新发布** + **Agent Skills 标准 2026 版本** + **公认的 AI coding workflow 模式**，定位 SYNTHESIS 未触达的功能机会。
> 消费方：FEATURES.md → requirements 阶段把"必/可能值得做"项转 REQ-ID。

---

## 一句话结论

curdx-flow 目前的 hook 矩阵只用到了 Claude Code 27+ 个 lifecycle 事件中的 10 个；2026-02 后 Anthropic 自己上了 **Agent Teams（Feb 5）+ Routines（Apr 14）+ Agent View 仪表盘（May 11）+ MCP Apps 交互 UI（Jan 26）+ Sandboxing/Auto Mode**；这些都是 SYNTHESIS.md 4 个分析对象项目里**没有**触及的层面，因为它们晚于那批仓库的快照。**curdx-flow 当前的 spec workflow 仍在"单 session、纯文本输出、用 stop-hook 验证"的旧模型里**，下面的清单按 Core Value（"Claude 走流程、不跳步、有证据"）相关度分级。

---

## A. 必/可能值得做（curdx-flow 缺、SYNTHESIS 也没收、有外部 consensus）

### A1. 利用 Claude Code 2026-Q1 新 hook 事件强化 "有证据" 🔴 强烈推荐

**它是什么** — Claude Code 在 2026 Q1 把 hook 事件数推到 27+，其中至少 6 个是 curdx-flow 当前**完全没用**的：

| 新 hook 事件 | 触发条件 | curdx-flow 用法建议 |
|---|---|---|
| `WorktreeCreate` / `WorktreeRemove` | `--worktree` / `isolation: "worktree"` 时 | epic 多 spec 并行场景的 worktree 自动 spawn / 清理（对接 [memory](feedback_epic_pre_fetch_main.md) 里"开 epic 前 fetch + diff main"原则） |
| `FileChanged` | 监听磁盘文件变化 | 监听 `specs/<name>/tasks.md` 外部编辑 → 自动 invalidate executor state |
| `ConfigChange` | `user_settings` / `project_settings` / `local_settings` / `skills` 修改 | **直接加固 SYNTHESIS Cluster A 的 Config Protection**：捕获 curdx-flow.local.md / `.curdx-state.json` 被改动的事件，做审计日志 |
| `PermissionRequest` / `PermissionDenied` | 权限弹窗 / auto-mode 拒绝 | curdx-flow 可以在 implement 阶段把高危工具（`rm -rf`、`git reset --hard`）自动 deny 并记入证据 |
| `Elicitation` / `ElicitationResult` | MCP 服务器请求用户输入 | spec executor 在等用户输入时不再 silently block；可以把 elicitation 记入 `.curdx-state.json` 的 `blocked_by` 字段 |
| `TaskCreated` | `TaskCreate` 工具调用前 | 给 `<modifications>` 协议（SYNTHESIS Cluster B 那条）提供原生 hook 落地点，而不是靠 Stop hook 事后检测 |
| `CwdChanged` | `cd` 改变工作目录 | 多 spec 之间切换的会话上下文重新加载触发点 |

**外部 consensus**
- 官方 hooks reference 2026 版列全：`https://code.claude.com/docs/en/hooks`（27+ 事件清单已 verified via WebFetch）
- "Claude Code Hooks: Complete Guide to All 12 Lifecycle Events"（2025 版本只有 12 个，对比可见 2026 年扩了一倍多）
- 与 SYNTHESIS 的关系：**不重叠**。SYNTHESIS Cluster A 列的 GateGuard（PreToolUse）/ Config Protection 都是借鉴 ECC 实现的旧 hook 类型；本节是**新 hook 事件类型**本身，是 Anthropic 在 ECC 镜像之后新增的。

**curdx-flow 当前缺口** — `plugins/curdx-flow/hooks/hooks.json` 当前注册 10 个 hook（见 ARCHITECTURE.md 第 183-194 行），全部是 2025 版就有的事件类型。WorktreeCreate / FileChanged / ConfigChange / TaskCreated 这 4 个新事件**在 spec workflow 强约束里是天然契合点**，但完全未利用。

**不搬代价** — Stop-hook 是事后检测；很多新事件是事前/事中拦截，能让 iron-law 验证从"判完成时才发现错"前推到"动作发生时就拦"。

**置信度**：HIGH（hook 列表已通过官方 docs verified；与 ECC v1.8/1.9 changelog 中提到的 hook 增长一致）

---

### A2. 集成 Claude Code Agent View（CLI Dashboard）—— **不要自己造一个** 🔴 强烈推荐

**它是什么** — 2026-05-11 Anthropic 发布 Agent View（Claude Code v2.1.139+，Research Preview）：单一 CLI dashboard 列出所有 background sessions，状态自动浮顶（Working/Needs Input/Idle/Completed/Failed/Stopped），通过 per-user supervisor process 管理。CLI 命令：`claude agents` / `claude --bg "prompt"` / `/bg` / `claude attach <id>` / `claude logs <id>` / `claude stop <id>`。

**外部 consensus**
- 官方文档 `https://code.claude.com/docs/en/agents.md`（顶级文档）
- 多源报道：buildfastwithai / claudefa.st / pasqualepillitteri / Cobus Greyling Substack 都在 5 月发文确认这是 May 2026 旗舰发布

**curdx-flow 与 SYNTHESIS 的关系** — SYNTHESIS 的剔除列表里明确说"**Python / Rust 控制平面**（ECC dashboard、ECC2、continuous-learning-v2 完整 Python CLI）— 与 curdx-flow Node-only + hook bundle 零运行时依赖约束冲突"。**Agent View 解决了同一类需求（多会话可见性），但是 Claude Code 原生实现**，因此完全符合"不重复造 Claude Code 已经做的事"原则。

**curdx-flow 当前缺口** — `/curdx-flow:status` 只能显示当前 session 的单一 spec；epic 多 spec 并行场景下没有总览。

**该做什么**（不重复造，做集成）：
1. spec 执行启动时通过 `claude --bg` 把每个 spec 推到 background session
2. `.curdx-state.json` 中新增 `agent_view_session_id` 字段，记录 Agent View 中的 session 标识
3. `/curdx-flow:status` 输出里加一行"Agent View: claude attach <session-id>" 让用户跳转
4. epic-level `/curdx-flow:triage` 自动把每个子 spec 推 background，触发条件：用户在 epic 模式下显式启用

**不搬代价** — 用户必须在 6 个 terminal tab 里手动 alt-tab 才能看到所有并行 spec 的进度；curdx-flow 错过了 2026-Q2 Claude Code 生态向 "**多 session 并行**" 转向的关键集成点。

**置信度**：HIGH（功能已 GA Research Preview，Anthropic 官方支持）

---

### A3. Agent Teams 替代部分 subagent 场景（review/research/cross-layer）🟠 高

**它是什么** — 2026-02-05 Anthropic 发布 Agent Teams（实验性，需 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`）。**与 subagent 的本质差异**：
- subagent 只能向 main agent 汇报；teammate **彼此可直接消息互通**（共享 mailbox / task file）
- 用户可以 **绕开 lead 直接和某个 teammate 对话**
- 适用于"多观点并行 + 互相 challenge"场景，单 main agent 拿不到的

**官方应用案例** — Anthropic 2026-03-09 用 Agent Teams 上线 Claude Code Review，内部 PR review coverage 从 16% 提升到 54%。

**外部 consensus**
- 官方文档 `https://code.claude.com/docs/en/agent-teams`
- 多源（claudefa.st / turingcollege / AddyOsmani.com / Mind Studio）2026 Q1-Q2 多次专题

**与 SYNTHESIS 的关系** — SYNTHESIS Cluster A 列了 superpowers 的"双阶段子代理审查（spec-compliance → code-quality）"。Agent Teams 是**实现该模式的 Claude Code 原生底座**，可以替代手工 prompt orchestration：
- spec-compliance reviewer 和 code-quality reviewer 作为两个 teammate
- 用户可直接 message code-quality teammate 问"为什么这个 ESLint rule 该放过" 而不必走 lead
- teammate 之间可以互相 challenge（spec-compliance 拒绝某项 → code-quality 解释为什么仍然推荐通过）

**curdx-flow 当前缺口** — `plugins/curdx-flow/agents/` 下的 spec-reviewer / code-quality-reviewer 当前是顺序 subagent 调用，没有 cross-agent dialogue 能力。

**不搬代价** — 错过 review 阶段的"对抗式验证"模式；只能靠 main agent 自己 mediate，本质上还是单一观点。

**置信度**：MEDIUM-HIGH（功能 GA 但仍标 experimental；需要确认 settings.json 配置能在 plugin 层级注入，待 spec 阶段实地验证）

---

### A4. Sandboxing + Auto Mode 作为 implement 阶段安全闸 🟠 高

**它是什么** — 2026 上半年 Anthropic 把 Sandboxing 从研究功能升为生产能力：
- `/sandbox` 命令开启 fs + network 隔离，内部数据显示**减少 84% 权限弹窗**
- Auto Mode：classifier model 判断动作安全性，自动批准或拒绝（research preview）
- Linux 实现支持 `enableWeakerNestedSandbox` 兼容 Docker 嵌套

**外部 consensus**
- 官方 doc `https://code.claude.com/docs/en/sandboxing` + `https://www.anthropic.com/engineering/claude-code-sandboxing`
- 多源（claudefa.st / MintMCP / Inventive HQ / mindstudio）2026 多次发文

**与 SYNTHESIS 的关系** — SYNTHESIS Cluster A 的 Config Protection / GateGuard 是**应用层**拦截（"别改 .eslintrc"）；Sandbox 是**OS 层**隔离（"压根不让 implement 改 .eslintrc 之外的预算之外文件"）。两者**互补不重叠**。

**curdx-flow 当前缺口** — implement 阶段完全依赖 Claude Code 默认权限；spec 边界（"只能改 specs/<name>/ 关联的文件"）目前是 prompt-level 约束（"don't touch unrelated files"），不是技术强约束。

**该做什么**：
1. `/curdx-flow:implement` 启动时自动 `/sandbox` + 把 spec 关联文件路径加入 allowed write list（来源：spec design.md 的"Affected files"段落）
2. PermissionDenied hook 监听 sandbox 拒绝事件，记入 `.curdx-state.json` 的证据流
3. 提供 `curdx-flow doctor sandbox` 子命令检查当前项目 sandbox 配置正确性

**不搬代价** — implement 阶段一旦 LLM 走错路（最经典：随手 `rm -rf node_modules` 来"clean state"），curdx-flow 没有 OS 层兜底。

**置信度**：HIGH（功能 GA；可能影响：在不支持 sandbox 的环境如 macOS 旧版可能 fallback，需 spec 阶段定灰度策略）

---

### A5. MCP Elicitation 替换 `AskUserQuestion` 阻塞 🟠 高

**它是什么** — Claude Code 2.1.76（2026-03-14）支持 MCP elicitation：MCP 服务器可在 tool 执行中请求结构化用户输入（form mode：弹对话框；URL mode：开浏览器 → 回 CLI 确认）；伴随两个 hook：`Elicitation`（拦截请求）/ `ElicitationResult`（修改用户回复）。

**外部 consensus**
- 官方 hooks ref（已在 A1 verified）
- 多源（aibuilderhub / claudelab / codilime）3-5 月发文

**与 SYNTHESIS 的关系** — SYNTHESIS Cluster B 提到 superpowers brainstorming `<HARD-GATE>`（设计未批准禁止 implement）。Elicitation 是**实现该 gate 用户交互的 Claude Code 原生通道**：design 阶段完成后弹结构化"已审阅设计？(yes/no + 备注)"对话框，回复进 `.curdx-state.json`。

**curdx-flow 当前缺口** — 当前 design → implement 转换的 user approval 靠 prompt 文本约定，不是 typed dialog；用户回答是自由文本，coordinator 自己解析意图（高失败率）。

**不搬代价** — design 阶段 → implement 阶段切换的 hard gate 在用户回复自然语言时容易被 LLM 误判 "approved"。

**置信度**：MEDIUM（functional confirmed，但要确认 Claude Code 本体能不能直接用 elicitation 而不必先架一个 MCP server；spec 阶段实地验证）

---

### A6. Routines/`/schedule` 做 curdx-flow 健康巡检 🟡 中

**它是什么** — 2026-04-14 Claude Code Routines 进入 research preview：`/schedule` 创建**持久 routine**（hourly/daily/weekdays/weekly preset 或 cron 表达式），跨 session 存续，可由 API call / GitHub event 触发。最小间隔 1 小时（更短用 session 内 `/loop`）。

**外部 consensus**
- 官方 `https://code.claude.com/docs/en/scheduled-tasks`
- 多源（pasqualepillitteri / mindstudio / claudelab / contextstudios）2026-Q2

**与 SYNTHESIS 的关系** — SYNTHESIS Cluster C 提到 ECC 的 skill 健康追踪（`skill-runs.jsonl`）+ Cluster E 的 Harness Audit 7 维评分。Routines 是**让这些审计能自动跑**的调度机制：daily skill health check + weekly harness audit → 把退化的 skill push 到 console。

**curdx-flow 当前缺口** — 所有 doctor / status 命令都要用户手动跑；没有 scheduled health monitoring。

**该做什么** — 提供"安装 curdx-flow routines"的便捷命令：`npx @curdx/flow install --routines` 自动注册 daily `curdx-flow doctor` + weekly `curdx-flow audit`。

**置信度**：MEDIUM（功能 research preview；最小间隔 1h 不影响 daily/weekly 场景；spec 阶段需评估是否动用户 Claude Code config）

---

### A7. spec 文档结构对齐 GitHub Spec Kit / AGENTS.md 跨工具标准 🟡 中

**它是什么** — 2026 行业出现 **spec-driven development 标准化**：
- **GitHub Spec Kit**（72K stars，MIT，4 阶段：Specify → Plan → Tasks → Implement）— 跨 Copilot / Claude Code / Gemini CLI / Cursor / Windsurf 通用
- **AGENTS.md**（Linux Foundation 旗下 Agentic AI Foundation 治理）— Sourcegraph / OpenAI / Google / Cursor / Factory 联合制定，多家 IDE 已支持
- **AWS Kiro**（fork VS Code）— Requirements (EARS-notation) → Design → Tasks 三阶段

**与 SYNTHESIS 的关系** — **不重叠**。SYNTHESIS 4 个分析对象都是 Claude Code 单一生态内的项目；行业标准化是**生态外**的新轴。

**curdx-flow 当前的 spec 文档结构**（per spec：`research.md` / `requirements.md` / `design.md` / `tasks.md` / `implement.md`）**接近** Spec Kit 但有差异：
- Spec Kit 的"Plan" 阶段在 curdx-flow 里融在 design.md
- AGENTS.md 是单文件 root-level，curdx-flow 的 CLAUDE.md / per-spec 文档体系更细
- Kiro 用 EARS notation 写 requirements（"WHEN <事件> THE SYSTEM SHALL <动作>"），curdx-flow 当前用 user story 自由格式

**curdx-flow 缺口与决策点**：
1. **AGENTS.md 兼容性** — 个人项目，作者本人也用 Cursor / Codex 偶尔 review；产出一份 `AGENTS.md` 摘要可以让其他 agent 读懂项目骨架。**低成本高 ROI**。
2. **EARS notation** — 在 requirements skill 里加可选 EARS 模板，让 acceptance criteria 更可机器验证。**中成本中 ROI**。
3. **Spec Kit JSON metadata** — 把 spec 文档头部加 Spec Kit 风格 frontmatter（spec_id / status / dependencies），让外部工具能 parse。**低成本中 ROI**。

**外部 consensus**
- GitHub Spec Kit：MIT release，72K+ stars
- AGENTS.md：60K+ repos 实测（thepromptshelf 2026 报告）
- Kiro：AWS Builder Library 多篇 case study

**curdx-flow 哲学约束** — `Out of Scope` 写明 "Claude Code-only"。但**采纳跨工具数据格式**（AGENTS.md / Spec Kit frontmatter）和**跨工具运行时**（实际让 Codex / Cursor 跑 spec workflow）是两件事，前者是数据兼容（接受），后者是运行时多 harness（拒绝）。

**置信度**：HIGH（spec-kit 和 AGENTS.md 都是开放标准、有 spec 文档；EARS notation 历史更老，已在 IEEE 文献中）

---

### A8. OpenTelemetry GenAI semantic conventions 给 spec workflow 加可观测性 🟡 中

**它是什么** — 2026 OpenTelemetry 推出 GenAI semantic conventions：每个 LLM 调用、tool 调用、subagent 委派都成为 OTel span，标准属性（model name、token counts、finish reason）跨厂商通用。Datadog / New Relic / Dynatrace 原生支持。**Claude Code 官方已 export metrics + log events via OTel，trace 在 beta**。

**外部 consensus**
- OpenTelemetry blog `https://opentelemetry.io/blog/2026/genai-observability/`
- Uptrace / SigNoz / Braintrust / Red Hat developer blog 多源
- Claude Code 文档（来自上面的 search 引用）确认 OTel 支持已 beta

**与 SYNTHESIS 的关系** — **完全不重叠**。SYNTHESIS Cluster E 的 Harness Audit 7 维评分是**静态打分**（静态分析仓库目录结构）；OTel 是**运行时 trace**（每次 spec 执行的实际行为）。两者互补。

**curdx-flow 当前缺口** — `.curdx-state.json` 是 per-spec 静态状态；执行过程中的 token 消耗、subagent 路径、verification 通过/失败比例没有持续指标，无法回答"过去一个月 implement 阶段平均消耗多少 token 收敛？哪个 skill 最常 timeout？"

**该做什么** — 选择性集成：
1. hook bundle 里加可选 OTel exporter（默认 off；零运行时依赖约束允许用 `OTEL_*` 环境变量 + 直接 HTTP POST 到 OTLP endpoint，避免引入 `@opentelemetry/*` package）
2. emit 关键 span：spec.start / spec.phase.transition / agent.dispatch / verification.gate / spec.complete
3. attributes：spec_id / phase / agent_name / verdict / iteration_count
4. 用户可通过 `CURDX_OTEL_ENDPOINT=...` 开启；不开就完全无感

**不搬代价** — 长期数据缺失；无法做 "本月哪个 skill 退化最快" 这类决策。

**置信度**：MEDIUM（功能轴明确，但 implementation 工作量 M；Claude Code OTel 自身仍 beta，需 spec 阶段确认其 trace 能不能 cross-process 串联到 hook 子进程）

---

### A9. Checkpointing (`/rewind`) 整合到 spec 失败恢复 🟢 中低

**它是什么** — Claude Code 自动 checkpoint 每次 prompt；`/rewind` 或 `Esc+Esc` 可恢复 code / conversation / 两者；持续 30 天。**已知限制**：bash 命令导致的文件改动（`rm`/`mv`/`cp`）不在 checkpoint 内。

**外部 consensus**
- 官方 doc `https://code.claude.com/docs/en/checkpointing`
- 多源（wmedia.es / mrq blog / vincentqiao / claudelog）2026-Q1-Q2

**与 SYNTHESIS 的关系** — SYNTHESIS 没提，4 仓库快照早于这个功能成熟。

**curdx-flow 当前缺口** — `src/runtime/recovery/` 已有"failure recovery"模块，但是 spec workflow 层面的（state file rollback、phase rewind）；Claude Code 原生 file-level checkpoint 不串联。spec executor failed 时，curdx-flow 只能告诉用户"重试这一步"，不能"先 `/rewind` 到上一个 checkpoint，再以新策略重跑"。

**不搬代价** — implement 阶段失败时，必须人工 git reset 或重写文件；checkpoint 在那儿但 curdx-flow 不知道怎么引导用户用。

**该做什么** — `/curdx-flow:cancel` 和 `recovery` skill 里加引导："建议先 `/rewind` 到 [last good checkpoint timestamp]，然后回到 [phase] 重跑"。**纯文档/skill 增强，不改 hook**。

**置信度**：HIGH（功能 GA；该改动 low risk）

---

### A10. MCP Apps：spec status / progress 用富 UI 渲染 🟢 低-中

**它是什么** — 2026-01-26 Model Context Protocol 上线 `ext-apps`：MCP server 可返回 HTML 在 chat 内 sandboxed iframe 渲染（dashboards / forms / 3D viz / multi-step workflows）。Claude / ChatGPT / Goose / VS Code 都已支持。Anthropic 自己出 `build-mcp-app` skill。

**外部 consensus**
- MCP blog `https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/`
- The Register 报道 `https://www.theregister.com/2026/01/26/claude_mcp_apps_arrives/`
- 多个 MCP marketplace skills 跟进

**与 SYNTHESIS 的关系** — **完全不重叠**。SYNTHESIS 的 Cluster B 提到 ECC 的 `harness-audit.js` 报告但是纯文本输出。

**curdx-flow 当前缺口** — `/curdx-flow:status` 输出 markdown 表格；epic 多 spec 场景下信息密度很高但用户得在 terminal 滚屏。

**该做什么**（可选，低优先级）：
1. 提供一个**可选** MCP server `@curdx/flow-mcp`，暴露 tool `curdx_status_ui` 返回 chat 内可点击的 spec dashboard
2. 用户在 Claude Code 里说"show status" → 弹出表格 + 进度条 + per-spec click-through
3. **零强制**：核心 spec workflow 不依赖这个 MCP 也能跑

**curdx-flow 哲学约束** — `Out of Scope` 里"不重复造 Claude Code 已经做的事"。MCP Apps 是 Claude Code 提供的 UI 通道，**借用** ≠ 重造。但 MCP server 引入运行时依赖（违反 hook bundle 零依赖约束）→ 必须是**独立 MCP server 包**（不能塞进 plugin/hooks/scripts/），可类比 chrome-devtools-mcp 当前的依赖方式。

**不搬代价** — 错过 2026 spec workflow 工具普遍引入 chat-inline UI 的趋势；用户体验比纯 markdown 落后。

**置信度**：MEDIUM（功能轴明确；实现工作量 M-L；与 curdx-flow 当前"零依赖"约束需要明确边界）

---

## B. 已被 SYNTHESIS 覆盖（明确跳过）

这些是研究中遇到、但 SYNTHESIS.md 已经收过的方向，**不重复**：

| 候选方向 | SYNTHESIS 对应位置 | 备注 |
|---|---|---|
| Hook profile / env 开关 | Cluster E（ECC 必搬#1） | 已收 |
| GateGuard PreToolUse fact-forcing | Cluster A（ECC 必搬#2） | 已收 |
| Config Protection lint config 锁 | Cluster A（ECC 必搬#3） | 已收 |
| Skill 健康追踪 `skill-runs.jsonl` | Cluster C（ECC 必搬#4） | 已收 |
| Harness Audit 7 维评分 | Cluster E（ECC 必搬#5） | 已收 |
| 双阶段子代理审查 spec-compliance → code-quality | Cluster A（superpowers 必搬#1） | 已收（**A3 是其原生底座升级**，不是替换） |
| CSO skill 写作原则 | Cluster C（superpowers 必搬#2） | 已收 |
| Brainstorming HARD-GATE | Cluster B（superpowers 必搬#4） | 已收（**A5 Elicitation 是其原生交互通道**） |
| Per-Phase 模型选择 | Cluster D（GSD 必搬#1） | 已收 |
| 动态路由 + 失败层级升级 | Cluster D（GSD 必搬#2） | 已收 |
| TDD 管道 RED-先于-GREEN | Cluster F（GSD 必搬#3） | 已收 |
| 验证债务追踪 status: partial | Cluster A（GSD 必搬#4） | 已收 |
| E2E Validation 义务表 | Cluster A（smart-ralph 必搬#1） | 已收 |
| `<modifications>` 段落 | Cluster B（smart-ralph 必搬#3） | 已收（**A1 TaskCreated hook 是其原生底座**） |
| ADR 体系 | Cluster G（GSD 借鉴#5） | 已收 |
| 跨 AI 委托 / Gemini 集成 | Out of Scope（哲学冲突） | 已剔除 |
| Plan Bounce 外部脚本 | Out of Scope | 已剔除 |
| 全局知识 store | Out of Scope（claude-mem 覆盖） | 已剔除 |

---

## C. Anti-Features（明确不要做、给理由）

### C1. ❌ 不要自己造 multi-session dashboard

**为什么** — Agent View（May 2026）已是 Claude Code 原生功能。SYNTHESIS Out of Scope 已明确剔除 "Python/Rust 控制平面"。重造会**直接违反**"不重复 Claude Code 已经做的事"原则。
**怎么办** — 见 A2，做集成（store session_id + 提供 attach 命令引导）。

### C2. ❌ 不要把 spec workflow 移植到 Codex / Cursor / Gemini CLI

**为什么** — SYNTHESIS Out of Scope 列了"Claude Code-only"。Agent Skills 标准跨工具的事实**不改变**这条约束：
- 跨工具运行时 = 维护 N 个 harness 适配 = 维护成本爆炸
- curdx-flow 的 hook 强约束是 Claude Code 特有能力，Gemini CLI / Cursor 的 hook 模型不一样
**怎么办** — 见 A7：**只采纳跨工具数据格式**（AGENTS.md / Spec Kit frontmatter），运行时仍专属 Claude Code。

### C3. ❌ 不要强制 sandbox 所有用户

**为什么** — Sandbox 在 macOS 旧版 / 嵌套 Docker / WSL 等环境有兼容性问题；强制开会让一部分用户装不上 curdx-flow，违反"作者本人是首要用户，体验流畅优先"。
**怎么办** — A4 设计为 opt-in：`/curdx-flow:implement` 检测到 sandbox 可用时建议开启，不强制；`curdx-flow doctor` 报告 sandbox readiness。

### C4. ❌ 不要复用 ECC 的 SQLite 状态存储

**为什么** — SYNTHESIS Out of Scope 已剔除"完整 Python CLI"等控制平面。SQLite 客户端在 Node 生态里又意味着 native binding（`better-sqlite3`），与 hook bundle 零运行时依赖约束**直接冲突**。
**怎么办** — `.curdx-state.json` 已经够用；如果将来需要跨 spec 历史查询，用 append-only JSONL（类比 ECC 的 `skill-runs.jsonl`，**纯 stdlib 可读**），不引数据库。

### C5. ❌ 不要做 IDE 插件（VS Code / JetBrains 原生）

**为什么** — VS Code Claude Code extension（2M+ devs）和 JetBrains plugin 都是 Anthropic 官方维护，已经把 CLI 嵌进 IDE。第三方 spec workflow 插件就是把同一个 skill 调用塞到 IDE 菜单，重造价值低。
**怎么办** — 通过 Claude Code 官方 IDE extension 间接获得 IDE 集成；curdx-flow 不做 IDE 适配层。

### C6. ❌ 不要把 curdx-flow skill 推到 agentskills.io marketplace 公开发布

**为什么** — `/curdx-flow:*` 是**有状态的强约束工作流**（hook + state file + agent 联合编排），不是"无状态可移植 skill"。强行发到 agentskills.io 会让安装它的非 Claude Code 用户**遇到 hook 不存在导致的 silent failure**。  
**怎么办** — 继续走 marketplace.json git source 分发；agentskills.io 留给将来某些**真正可移植的子组件**（例如纯模板 skill）。

---

## D. 决策点（要请用户在 requirements 阶段拍板）

1. **A1 新 hook 事件**：哪些先做？建议优先级 `TaskCreated` > `ConfigChange` > `WorktreeCreate/Remove` > `FileChanged` > `Elicitation` > `PermissionRequest/Denied` > `CwdChanged`
2. **A2 Agent View 集成**：是默认走 background session（spec 一启动就 `claude --bg`），还是 opt-in？默认 opt-in 比较稳。
3. **A3 Agent Teams**：纳入但保持 experimental flag；spec 阶段决定哪些 reviewer pair 用 Agent Teams 重写
4. **A4 Sandbox**：implement 阶段建议开 sandbox，**但只在 `curdx-flow doctor sandbox` 通过时**；硬强制 = 不要
5. **A5 Elicitation**：评估是否需先架一个 minimal MCP server 作为 elicitation 通道，或者直接复用 Claude Code 内置的某个 MCP server
6. **A6 Routines**：是否提供 `npx @curdx/flow install --routines` 一键安装；如果改动用户 Claude Code config 需要明显提示
7. **A7 跨工具数据格式**：先做哪个？AGENTS.md 摘要最便宜；EARS notation 影响 requirements skill 大改
8. **A8 OpenTelemetry**：开始就纯 env 开关 opt-in，零依赖；同意？
9. **A9 Checkpoint 引导**：纯 skill 文档增强；同意？
10. **A10 MCP Apps**：今年做不做？如果做要不要独立 npm 包 `@curdx/flow-mcp`？

---

## E. Sources（带置信度）

### HIGH（官方文档 / 官方发布）
- Claude Code Hooks reference（27+ events 2026-05）：`https://code.claude.com/docs/en/hooks`
- Claude Code Agent Teams：`https://code.claude.com/docs/en/agent-teams`
- Claude Code Sandboxing：`https://code.claude.com/docs/en/sandboxing` + `https://www.anthropic.com/engineering/claude-code-sandboxing`
- Claude Code Routines / scheduled-tasks：`https://code.claude.com/docs/en/scheduled-tasks`
- Claude Code Checkpointing：`https://code.claude.com/docs/en/checkpointing`
- Claude Code Output styles：`https://code.claude.com/docs/en/output-styles`
- Claude Code Changelog：`https://code.claude.com/docs/en/changelog`
- Claude Code Agent View 顶级 doc：`https://code.claude.com/docs/en/agents.md`
- Agent Skills 官方门户：`https://agentskills.io/`
- MCP Apps spec：`https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/` + `https://github.com/modelcontextprotocol/ext-apps`
- OpenTelemetry GenAI semantic conventions：`https://opentelemetry.io/blog/2026/genai-observability/`

### MEDIUM（多源印证，非官方但可靠）
- Agent View 解读（May 2026）：`https://pasqualepillitteri.it/en/news/2384/claude-code-agent-view-cli-dashboard-sessions-2026`
- Agent Teams 实战：`https://addyosmani.com/blog/claude-code-agent-teams/` + `https://claudefa.st/blog/guide/agents/agent-teams`
- MCP Elicitation：`https://aibuilderhub.dev/en/blog/claude-code-mcp-elicitation` + `https://claudelab.net/en/articles/claude-code/mcp-elicitation-support`
- Routines 解读：`https://pasqualepillitteri.it/en/news/851/claude-code-routines-cloud-automation-guide`
- AGENTS.md vs CLAUDE.md：`https://thepromptshelf.dev/blog/agents-md-vs-claude-md/`
- Spec Kit / Kiro 对比：`https://medium.com/system-design-mastery-series/aws-kiro-vs-github-spec-kit-the-honest-comparison-every-developer-needs-right-now-8284412d7668`

### LOW（单源、需 spec 阶段二次验证）
- 27+ hook events 总数：单一统计源 `https://thepromptshelf.dev/blog/claude-code-hooks-complete-reference-2026/` —— 已 cross-check 官方 doc 但官方 doc 没明确说"27"这个数字，count 待自己数一次
- "84% 权限弹窗减少"：Anthropic 自家数据，非外部验证
- Routines 最小间隔 1h：仅在 secondary source 看到，要 spec 阶段读官方 doc 二次验证

---

## F. 与 SYNTHESIS 的关系总表

| 本文章节 | SYNTHESIS 是否覆盖 | 关系类型 |
|---|---|---|
| A1 新 hook 事件 | 否 | **新增**（4 仓库快照时这些事件还不存在） |
| A2 Agent View 集成 | 否 | **新增**（May 2026 才发布） |
| A3 Agent Teams | 部分（superpowers 双阶段审查） | **底座升级**（提供原生实现） |
| A4 Sandboxing + Auto Mode | 部分（ECC Config Protection） | **互补**（OS 层 vs 应用层） |
| A5 MCP Elicitation | 部分（superpowers HARD-GATE） | **底座升级**（提供原生交互） |
| A6 Routines 健康巡检 | 部分（ECC skill 健康 + Harness Audit） | **运行时**（让审计自动跑） |
| A7 跨工具 spec 标准 | 否 | **新轴**（生态外的标准化） |
| A8 OpenTelemetry | 否 | **新轴**（运行时可观测性） |
| A9 Checkpoint 引导 | 否 | **新增**（功能成熟于 4 仓库快照之后） |
| A10 MCP Apps UI | 否 | **新增**（2026-01 才上线） |

---

*Last updated: 2026-05-18 — Gap-fill mode, complementing SYNTHESIS.md 7 clusters*

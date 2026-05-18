---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'Claude Code plugin latest architecture and release mechanics for curdx-flow optimization'
research_goals: '校准 Claude Code 最新插件架构、依赖、hooks、skills、agents、native /goal、marketplace、tag/release 机制，并对照 plugins/curdx-flow 找出安全的激进优化方向'
user_name: '王定旭'
date: '2026-05-15'
web_research_enabled: true
source_verification: true
status: 'complete'
---

# Research Report: Technical

**Date:** 2026-05-15
**Author:** 王定旭
**Research Type:** technical

---

## Research Overview

本研究面向 `curdx-flow` 的 Claude Code 插件产品面，核对官方 Claude Code 当前文档和本仓库实现，覆盖 plugin manifest、skills、agents、hooks、plugin dependencies、external MCP、native `/goal`、marketplace、tag/release、doctor/smoke gates 等关键技术面。

核心结论是：`plugins/curdx-flow` 应按真实交付插件产品治理，而不是示例目录；优化方向应从“堆叠更长 prompt”转向“以 deterministic runtime、schema/state、source-generated hooks、installed-plugin smoke、release/tag parity、native `/goal` first-class capability 为核心”的架构升级。Claude Code 已更新到 `2.1.142`，满足官方 `/goal` 的 `v2.1.139+` 要求。

完整综合结论见文末 `Research Synthesis`，可直接作为后续 PRD、架构方案和 epics/stories 的输入。

---

## Technical Research Scope Confirmation

**Research Topic:** Claude Code plugin latest architecture and release mechanics for curdx-flow optimization
**Research Goals:** 校准 Claude Code 最新插件架构、依赖、hooks、skills、agents、native `/goal`、marketplace、tag/release 机制，并对照 `plugins/curdx-flow` 找出安全的激进优化方向。

**Technical Research Scope:**

- Architecture Analysis - Claude Code plugin manifest、skills、agents、hooks、bin、marketplace 的设计约束
- Implementation Approaches - `plugins/curdx-flow` 当前实现如何对齐或偏离官方能力
- Technology Stack - Node/TypeScript CLI、Claude Code plugin runtime、plugin dependencies、外部 MCP
- Integration Patterns - `pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max`、`context7`、`sequential-thinking` 的正确边界
- Native Goal Driver - `/goal` 的版本要求、completion condition、Stop hook 关系、非交互模式和 fallback 策略
- Release Mechanics - npm `vX.Y.Z` tag、Claude plugin `curdx-flow--vX.Y.Z` tag、`claude plugin tag --push`、验证、烟测、doctor 流程
- Risk & Compatibility - hook fail-open、升级路径、安装态验证、离线/缺依赖降级、用户状态迁移

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-05-15

---

## Technology Stack Analysis

### Programming Languages

`curdx-flow` 的主语言选择仍然应保持为 **TypeScript on Node.js**。本仓库 `package.json` 声明 `type: "module"`、Node `>=20.12.0`、TypeScript `^5.6.0`、tsup/esbuild/Vitest 工具链，并通过 `dist/index.mjs` 交付 npm CLI。Claude Code 插件运行面则通过 plugin root 中的 Markdown skills/agents、JSON manifest/hooks 配置，以及 Node `.mjs` hook 脚本组合交付。

官方 Claude Code 插件文档确认插件目录可以包含 `.claude-plugin/plugin.json`、`commands/`、`agents/`、`hooks/`、`skills/`、`CLAUDE.md`、`settings.json`、`scripts/`、`mcp.json`、`README.md`、`LICENSE` 等组件；这与本仓库 `plugins/curdx-flow` 的 manifest、skills、agents、hooks、schemas、templates、references、bin 组合基本一致，但 `schemas/templates/references/bin` 属于 curdx-flow 自身产品结构，需要由 plugin runtime 或 skills 明确引用，而不能假设 Claude Code 原生识别。
_Popular Languages:_ TypeScript/JavaScript for CLI、runtime helpers、hook scripts；Markdown/YAML-like frontmatter for skills/agents；JSON for manifests、hooks、schemas、state。
_Emerging/Relevant Runtime:_ Claude Code plugin runtime 自身不是传统应用框架，而是由 Claude CLI 解释 manifest、skills、agents、hooks、settings、dependencies 的插件平台。
_Language Evolution:_ 对 curdx-flow 最重要的演进不是换语言，而是减少 shell/jq/grep 假设，继续把跨平台 runtime 逻辑收敛到 Node CLI/lib。
_Performance Characteristics:_ hook 脚本必须短路径、低延迟、fail-open；长推理和复杂工作应放在 skills/agents/workflow，而不是 hook 事件处理器。
_Sources:_ 官方插件结构文档 <https://code.claude.com/docs/en/plugins>；本地 `package.json`；本地 `plugins/curdx-flow/.claude-plugin/plugin.json`。
_Confidence:_ High。官方文档和本地 manifest/package 一致支持该结论。

### Development Frameworks and Libraries

本项目不是 Web framework 项目，而是 **Claude Code plugin + Node CLI framework** 项目。CLI 使用 `citty` 做命令分发、`@clack/prompts` 做交互、`tinyexec` 做子进程执行、`picocolors` 做终端输出；构建使用 `tsup` 打 CLI、`esbuild` 打 hooks；测试使用 `vitest`。Claude Code plugin 框架层的关键构件是 `plugin.json`、skills、agents、hooks、plugin dependencies、marketplace metadata 和 `claude plugin validate`。

官方 skills 文档确认 skills 是包含 `SKILL.md` 的目录，frontmatter 支持 `name`、`description`、`allowed-tools`、`disable-model-invocation` 等字段；`allowed-tools` 默认继承所有可用工具，`disable-model-invocation: true` 会禁止模型自动触发，只能由用户显式调用或由其他 skill 引用。这直接支持 curdx-flow 当前“公共 mutating workflow skill 必须显式触发”的策略。
官方 hooks 文档确认 hook 可以由命令形式运行，接收 JSON stdin，返回 stdout JSON 或通过 exit code 控制流程；普通 stdout 会进入 transcript，因此 hook stdout 必须被当作协议通道处理。
_Major Frameworks:_ Claude Code plugin framework、Node ESM CLI、TypeScript strict mode。
_Micro-frameworks:_ `citty`、`@clack/prompts`、`tinyexec`、`picocolors`。
_Evolution Trends:_ curdx-flow 的优化重点应从“更多 prompt 内容”转向“更强 manifest/registry/schema/test/source-generated parity”。
_Ecosystem Maturity:_ Claude Code plugin 功能已覆盖 plugins、skills、agents、hooks、MCP、marketplace、dependencies、plugin tag/version workflows，但外部契约仍应以当前 `claude` CLI 和官方文档验证为准。
_Sources:_ Skills 文档 <https://code.claude.com/docs/en/skills>；Hooks 文档 <https://code.claude.com/docs/en/hooks>；Plugin reference <https://code.claude.com/docs/en/plugins-reference>；本地 `package.json`。
_Confidence:_ High for current toolchain and documented plugin surfaces; Medium for any newly added manifest/frontmatter field until validated by installed Claude CLI.

### Database and Storage Technologies

curdx-flow 当前没有传统数据库。它的持久化风险集中在 **JSON state、schema、Claude plugin data、managed user files 和 release metadata**。Claude Code 插件文档说明 `${CLAUDE_PLUGIN_DATA}` 是插件的持久数据目录，位于 `~/.claude/plugins/data/{marketplace}/{plugin-name}`；`${CLAUDE_PLUGIN_ROOT}` 指向已安装插件根目录。这意味着 shipped plugin runtime 不应依赖 repo-relative source path 或 dev dependency。

本仓库的本地状态包括 `.curdx-state.json`、`.curdx/brain.jsonl`、managed `~/.claude/CLAUDE.md` block、plugin manifest/version、marketplace metadata、generated hook bundles。JSON schema 位于 `plugins/curdx-flow/schemas/spec.schema.json`，hook/shared types 位于 `src/hooks/_shared/types.ts`。
_Relational Databases:_ Not applicable。
_NoSQL/Document Storage:_ JSON state、manifest、marketplace、schema、transcript/event files 是核心存储形态。
_In-Memory/Cached State:_ 本仓库 registry/plugin state 有进程内 cache；install/update/uninstall 后必须清 cache。
_Data Warehousing:_ Not applicable；分析功能处理 Claude transcript rows，但不是数据仓库。
_Source:_ Plugins 文档中环境变量与 plugin data 说明 <https://code.claude.com/docs/en/plugins>；本地 `plugins/curdx-flow/schemas/spec.schema.json`；本地 `src/hooks/_shared/types.ts`。
_Confidence:_ High。

### Development Tools and Platforms

本地开发平台应围绕 `npm`、Node 20/22、TypeScript、Vitest、Claude CLI 和 GitHub Actions。`npm run verify` 当前覆盖 typecheck、version parity、hook freshness、build、bundle size、hook/analyze/runner tests、verification-block checks；但不包含 `npm run test:claudecc`，所以 Claude plugin smoke 必须单独运行。

官方 plugin reference 确认 `claude plugin validate <path>` 可验证 plugin structure/configuration，`claude plugin marketplace add/remove/list/update` 管理 marketplace，`claude plugin install/update/enable/disable/remove/list` 管理插件，`claude plugin tag` / `tag --push` 支持插件 release tagging。当前已安装 Claude Code CLI 已更新为 `2.1.142`。
_IDE and Editors:_ Not central to product architecture。
_Version Control:_ Git tags 是 release 机制的一部分，npm `vX.Y.Z` 与 Claude plugin `curdx-flow--vX.Y.Z` 必须区分。
_Build Systems:_ `tsup` for `dist/index.mjs`；`esbuild` via `scripts/build-hooks.mjs` for plugin hook bundles。
_Testing Frameworks:_ Vitest for unit/integration suites；Claude CLI validation/smoke for plugin runtime behavior。
_Source:_ Plugin CLI reference <https://code.claude.com/docs/en/plugins-reference>；本地 `package.json` scripts；本地 `scripts/check-versions.mjs` / `scripts/build-hooks.mjs`。
_Confidence:_ High。

### Cloud Infrastructure and Deployment

curdx-flow 的“部署”不是传统云部署，而是 **npm publish + GitHub release + Claude Code marketplace/plugin tag**。本仓库 `.github/workflows/release.yml` 在 `v*` tag push 时运行 npm publish 和 GitHub release；Claude Code plugin dependency resolution 还依赖 `{plugin-name}--v{version}` 格式的 plugin tag。官方 plugin dependencies 文档说明 dependency 的 resolved tag format 是 `{plugin-name}--v{version}`，跨 marketplace dependencies 要由 marketplace owner 通过 `allowCrossMarketplaceDependenciesOn` 显式允许。

这意味着 release architecture 必须维护两个外部发布面：npm package `@curdx/flow` 和 Claude Code plugin `curdx-flow`。只推 npm tag 不等于插件依赖可解析；只推 plugin tag 也不等于 npm CLI 已发布。
_Major Cloud Providers:_ Not applicable。
_Container Technologies:_ Not currently part of product delivery。
_Serverless Platforms:_ Not applicable。
_CDN/Edge:_ Not applicable。
_Release Platforms:_ GitHub Actions、npm registry、Claude Code plugin marketplace/tag resolution。
_Source:_ Plugin dependencies 文档 <https://code.claude.com/docs/en/plugin-dependencies>；Plugin reference <https://code.claude.com/docs/en/plugins-reference>；本地 `.github/workflows/release.yml`。
_Confidence:_ High。

### Technology Adoption Trends

Claude Code plugin projects are moving toward **packaged, validated, dependency-aware plugin ecosystems** rather than ad hoc slash-command prompt folders. For curdx-flow, the relevant trend is to treat plugin surfaces as runtime contracts: manifest fields, dependency shapes, hooks event schemas, skills frontmatter, agents frontmatter, marketplace metadata, and release tags must be validated against current Claude CLI behavior.

Official docs emphasize plugin discoverability/validation, plugin dependencies, marketplace trust, hooks as deterministic customization points, and skills as progressive-disclosure capability packages. For curdx-flow, the strongest optimization path is therefore not adding more monolithic prompt text, but tightening runtime contracts: smaller public skills, reference-backed details, source-generated hooks, schema-backed state, installed-plugin smoke coverage, and explicit degradation when companion capabilities are missing.
_Migration Patterns:_ From shell snippets and prose-only contracts toward Node runtime helpers, schema validation, and CLI/plugin smoke tests.
_Emerging Technologies:_ Claude Code plugin dependencies and marketplace trust rules are first-class release constraints; plugin tag/version management should become a core gate.
_Legacy Technology:_ POSIX-specific shell/jq/grep/lsof assumptions and repo-relative runtime path assumptions should continue to be removed from shipped plugin paths.
_Community Trends:_ Reusable skills/agents/hooks/plugins are becoming packaged artifacts that require validation, versioning, dependency resolution, and local installed-state testing.
_Sources:_ Plugins overview <https://code.claude.com/docs/en/plugins>；Skills docs <https://code.claude.com/docs/en/skills>；Hooks docs <https://code.claude.com/docs/en/hooks>；Plugin dependencies docs <https://code.claude.com/docs/en/plugin-dependencies>；Plugin reference <https://code.claude.com/docs/en/plugins-reference>。
_Confidence:_ High for documented Claude Code features; Medium for ecosystem direction, because it is inferred from current docs and curdx-flow repository shape.

---

## Integration Patterns Analysis

### API Design Patterns

curdx-flow 的主要 API 不是 HTTP API，而是 **Claude Code 插件协议面 + npm CLI + local runtime CLI**。关键入口包括：

- npm CLI：`@curdx/flow` -> `dist/index.mjs`，负责安装、更新、状态、doctor、分析等本地操作。
- Plugin manifest API：`plugins/curdx-flow/.claude-plugin/plugin.json`，声明 plugin identity、version、dependencies、skills path、agents list。
- Marketplace API：repo-root `.claude-plugin/marketplace.json`，声明 marketplace、plugin source、version、cross-marketplace trust。
- Slash-command/skill API：`/curdx-flow:*` 命名空间，由 `skills/<name>/SKILL.md` 驱动。
- Hook API：`plugins/curdx-flow/hooks/hooks.json` 将 Claude Code events 映射到 bundled Node command hooks。
- Runtime helper API：`plugins/curdx-flow/bin/curdx-flow` 和 `hooks/scripts/lib/*.mjs` 给 skills/hooks 提供本地确定性能力。

官方插件文档确认 plugin skills 总是按 plugin name 命名空间隔离，例如 `/my-plugin:hello`，并建议用 `--plugin-dir` 本地加载插件测试；这意味着 curdx-flow 的 public API 应优先稳定 `/curdx-flow:*` skill names，而不是内部文件名或 prompt 细节。
_RESTful APIs:_ Not central；Claude CLI/plugin commands 是主要控制面。
_GraphQL APIs:_ Not applicable。
_RPC/gRPC:_ Not applicable；hook command protocol 是 JSON stdin/stdout + exit-code semantics。
_Webhook Patterns:_ Claude hooks 类似事件回调机制，应该被视为 lifecycle/event API，而不是长任务执行引擎。
_Source:_ Plugins docs <https://code.claude.com/docs/en/plugins>；Plugin reference <https://code.claude.com/docs/en/plugins-reference>；本地 `plugins/curdx-flow/.claude-plugin/plugin.json`；本地 `plugins/curdx-flow/hooks/hooks.json`。
_Confidence:_ High。

### Communication Protocols

curdx-flow 与 Claude Code 的最关键通信协议是 **command hook JSON protocol**。官方 hooks 文档说明：hook 命令通过 stdin 接收 JSON；exit `0` 时 Claude Code 会解析 stdout 中的 JSON output fields；大多数事件只有 exit `2` 表示阻塞；`UserPromptSubmit`、`UserPromptExpansion`、`SessionStart` 的 stdout 会进入 Claude 可见上下文；hook stdout 如果要作为 JSON，必须只包含 JSON object。对于 curdx-flow，结论是 hooks 只能输出协议 JSON 或有意的 context，所有诊断都应走 stderr / error logger。

官方 MCP 文档说明 Claude Code 支持 HTTP、SSE、stdio MCP；HTTP 是远程 MCP 推荐选项，SSE 已 deprecated；stdio 适合本地进程。Claude Code 还会为 MCP server 设置 `CLAUDE_PROJECT_DIR`，plugin-provided MCP server 可以使用 `${CLAUDE_PLUGIN_ROOT}`、`${CLAUDE_PLUGIN_DATA}`、`${CLAUDE_PROJECT_DIR}`。本仓库当前将 `context7` 和 `sequential-thinking` 建模为外部 MCP，通过 `claude mcp add --scope user` 安装/检测；这与“curdx-flow 不 vendor 外部 MCP”的边界一致。
_HTTP/HTTPS Protocols:_ Relevant for external MCP such as Context7 HTTP server; use `claude mcp add --transport http`.
_SSE Protocols:_ Claude docs mark SSE as deprecated; do not introduce new SSE-first integration unless upstream requires it and fallback is documented.
_Stdio Protocols:_ Relevant for local MCP such as `@modelcontextprotocol/server-sequential-thinking`; command/args must be argv-array safe, not shell-concatenated.
_Hook Protocol:_ JSON stdin/stdout + event-specific output schema + exit-code semantics. This is the highest-risk integration protocol for curdx-flow.
_Source:_ Hooks docs <https://code.claude.com/docs/en/hooks>；MCP docs <https://code.claude.com/docs/en/mcp>；本地 `src/registry/mcps/context7.ts`；本地 `src/registry/mcps/sequential-thinking.ts`。
_Confidence:_ High。

### Data Formats and Standards

curdx-flow 的集成数据格式集中在 JSON、Markdown frontmatter、JSON Schema、JSONL evidence/event logs 和 Git tags。

- `plugin.json` and `marketplace.json`: Claude Code plugin/marketplace metadata and dependency trust.
- `hooks.json`: event-to-command hook wiring.
- `SKILL.md` and agent `.md`: Markdown body + YAML frontmatter.
- `.curdx-state.json`: workflow state contract; must stay schema/type compatible.
- `.curdx/brain.jsonl` and transcript-derived analysis: append-only/event-style evidence.
- Git tag names: npm release tags use `vX.Y.Z`; Claude plugin dependency version resolution uses `{plugin-name}--v{version}`.

Official skills docs clarify `disable-model-invocation: true` prevents automatic model invocation and is appropriate for user-controlled workflows with side effects. They also clarify `allowed-tools` grants permission for listed tools while the skill is active; it is not a denylist. This matters because curdx-flow mutating workflow skills must not rely on `allowed-tools` as a restriction mechanism.
_JSON and XML:_ JSON is dominant; XML not relevant.
_Protobuf/MessagePack:_ Not currently justified; hook/plugin protocols are JSON/Markdown-based.
_Flat Files:_ Markdown templates/references and JSONL event logs are intentional flat-file integration surfaces.
_Custom Formats:_ Agent markers such as `TASK_COMPLETE` / `REVIEW_PASS` are protocol strings and must not be treated as prose.
_Source:_ Skills docs <https://code.claude.com/docs/en/skills>；Plugin dependencies docs <https://code.claude.com/docs/en/plugin-dependencies>；本地 `plugins/curdx-flow/references/agent-output-contract.md`；本地 schemas。
_Confidence:_ High。

### System Interoperability Approaches

curdx-flow 应采用 **orchestrator + capability routing**，而不是复制外部插件/MCP。当前本地 `src/registry/capabilities.ts` 已把能力分成：

- plugin dependencies: `pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max`
- external MCP: `context7`、`sequential-thinking`
- workflow gates: docs-query、browser-verification、tdd-cycle、security-review、stack-specific-verification

官方 plugin dependencies 文档说明跨 marketplace dependency 默认被阻止，除非 root marketplace 的 `marketplace.json` 将目标 marketplace 加入 `allowCrossMarketplaceDependenciesOn`。当前 repo-root marketplace 已允许 `pua-skills`、`thedotmack`、`chrome-devtools-plugins`、`ui-ux-pro-max-skill`，这正是 curdx-flow plugin dependency 解析所需的 trust surface。
_Point-to-Point Integration:_ CLI invokes `claude plugin ...` and `claude mcp ...` commands; use argv arrays and clear cache after state-changing actions.
_API Gateway Pattern:_ `curdx-flow route` / `doctor` / runtime helpers act as local deterministic gateway from user intent to capabilities.
_Service Mesh:_ Not applicable。
_Enterprise Service Bus:_ Not applicable。
_Source:_ Plugin dependencies docs <https://code.claude.com/docs/en/plugin-dependencies>；本地 `src/registry/capabilities.ts`；本地 `.claude-plugin/marketplace.json`。
_Confidence:_ High。

### Microservices Integration Patterns

Microservices terminology does not directly fit this project, but several resilience patterns map cleanly:

- **Service discovery:** `claude plugin list --json` and `claude mcp list` / `/mcp` are the source of truth for plugin/MCP availability, not static assumptions.
- **Circuit breaker:** when required companion capability is missing, curdx-flow should degrade, surface remediation, and avoid claiming evidence that depends on the missing capability.
- **Saga/compensation:** install/update/uninstall flows must handle partial state: marketplace added but plugin failed, dependency unavailable, one release tag pushed but the other missing, generated files stale after build failure.
- **API gateway:** registry/capability routing should centralize “when to use” and “missingAction” policy instead of embedding divergent shell snippets in skills.

Official plugin reference includes `plugin prune` for removing auto-installed plugin dependencies no longer required by installed plugins, reinforcing that dependency lifecycle is managed by Claude Code plugin commands and should not be hand-modeled as arbitrary MCP state.
_API Gateway Pattern:_ Local runtime/registry is the curdx-flow gateway for capability routing.
_Service Discovery:_ Claude CLI plugin/MCP list commands and doctor output.
_Circuit Breaker Pattern:_ Required for hooks and external capability evidence gates.
_Saga Pattern:_ Required for release, install/update, and state migrations.
_Source:_ Plugin reference <https://code.claude.com/docs/en/plugins-reference>；MCP docs <https://code.claude.com/docs/en/mcp>；本地 `src/registry/plugins/*`；本地 `src/hooks/lib/runtime-cli.ts`。
_Confidence:_ Medium-High：patterns are architectural mappings, while underlying Claude CLI commands are documented.

### Event-Driven Integration

curdx-flow 是高度 event-driven 的 Claude Code 插件。当前 hooks wiring 包括 `UserPromptSubmit`、`UserPromptExpansion`、`PreToolUse`、`Stop`、`SessionStart`、`SubagentStart`、`TaskCompleted`、`PostToolBatch`、`PostCompact`、`StopFailure`。这些事件覆盖 prompt routing、slash expansion、quick-mode gating、session context loading、subagent context injection、task completion verification、batch state snapshots、compact recovery and stop failure observability。

官方 hooks docs 明确不同事件对 block/continue/context injection 的语义不同。例如 `SubagentStart` 不能阻止 subagent creation，但可注入 context；`PostToolBatch` exit `2` 可在下一次 model call 前停止 agentic loop；`TaskCompleted` exit `2` 可阻止 task marked completed。curdx-flow 的优化应把 event-specific semantics 编码到 source/tests，而不是靠 prompt 记忆。
_Publish-Subscribe Patterns:_ Hooks subscribe to Claude Code lifecycle events and emit context/decisions.
_Event Sourcing:_ `.curdx/brain.jsonl` and verification blocks can act as event/evidence trail, but must stay bounded and redacted.
_Message Broker Patterns:_ Not applicable。
_CQRS Patterns:_ Read-only snapshot/route helpers should remain separate from state-mutating merge/update helpers.
_Source:_ Hooks docs <https://code.claude.com/docs/en/hooks>；本地 `plugins/curdx-flow/hooks/hooks.json`；本地 `src/hooks/**`。
_Confidence:_ High。

### Integration Security Patterns

The highest integration security risks are not OAuth-style web API auth; they are **tool permission widening, prompt/context leakage, external MCP trust, plugin dependency trust, shell execution, and hook blocking behavior**.

Official MCP docs warn users to verify trust before connecting MCP servers because servers that fetch external content can expose prompt injection risk. Official skills docs clarify `allowed-tools` grants approval for listed tools while the skill is active; broad `allowed-tools` therefore expands action authority. Official subagent docs state plugin subagents ignore `hooks`, `mcpServers`, and `permissionMode` frontmatter; curdx-flow must not rely on those fields for plugin-shipped agents.

Security implications for curdx-flow:

- Do not add plugin-local `.mcp.json` for `context7` or `sequential-thinking` unless product strategy changes; current model treats them as external user-scoped MCPs.
- Do not widen skill/agent/hook tool authority without product reason and regression evidence.
- Do not log prompts, memory payloads, MCP responses, env vars, or file contents by default.
- Do not trust agent output markers without artifact/evidence verification.
- Do not make hooks fail closed except for explicit curdx-flow gates; a broken hook can make Claude Code feel broken.

_OAuth 2.0/JWT:_ Relevant only for third-party MCPs that require auth; curdx-flow should delegate to Claude MCP auth flows rather than store secrets.
_API Key Management:_ External MCP credentials belong in Claude MCP config/env, not curdx-flow repo files or logs.
_Mutual TLS:_ Not currently part of product scope.
_Data Encryption:_ Rely on transport/security of external services; curdx-flow must avoid unnecessary persistence of sensitive content.
_Source:_ MCP docs <https://code.claude.com/docs/en/mcp>；Skills docs <https://code.claude.com/docs/en/skills>；Subagents docs <https://code.claude.com/docs/en/sub-agents>；Hooks docs <https://code.claude.com/docs/en/hooks>。
_Confidence:_ High for documented security surfaces; Medium for product-specific policy recommendations.

---

## Architectural Patterns and Design

### System Architecture Patterns

curdx-flow 应采用 **plugin product shell + deterministic runtime core + model-driven phase workers + native goal loop** 的分层架构：

1. **Plugin product shell:** `plugins/curdx-flow/.claude-plugin/plugin.json`、skills、agents、hooks、templates、references 是最终用户安装和调用的产品面。
2. **Deterministic runtime core:** `plugins/curdx-flow/bin/curdx-flow`、`hooks/scripts/lib/*.mjs`、`src/hooks/lib/**` 负责 route、snapshot、doctor、last-mile、goal bridge、state merge、verification gates。
3. **Model-driven phase workers:** skills 负责协调，agents 负责 research/requirements/design/tasks/execution/review，但 completion markers 只是信号，必须由 coordinator 验证。
4. **Native `/goal` execution driver:** 对长任务，Claude Code `/goal` 比 Stop-hook continuation 更适合做跨 turn 驱动；curdx-flow Stop hook 应负责 hard gates、cleanup、evidence checks，而不是再注入第二套自治循环。

官方 `/goal` 文档说明：`/goal` 设置 completion condition 后，Claude 会在多个 turn 中持续工作；每轮结束后由小模型评估条件是否满足；它本质上是 session-scoped prompt-based Stop hook wrapper。文档也说明 `/goal` 需要 Claude Code v2.1.139+；本机已更新到 `2.1.142`，因此当前环境满足最低版本前置条件。curdx-flow 仍应保留 `/goal` availability detection，用于处理其他用户环境、hooks disabled 或 managed hooks policy 情况。
_Source:_ Goals docs <https://code.claude.com/docs/en/goal>；Commands docs <https://code.claude.com/docs/en/commands>；本地 `src/hooks/lib/goal-bridge.ts`；本地 `src/hooks/stop-watcher.ts`；本机 `claude --version`。
_Confidence:_ High for official `/goal` behavior; High for local version observation; Medium for fallback design because it is a product architecture recommendation.

### Design Principles and Best Practices

核心设计原则应是 **runtime contracts over prompt convention**：

- Plugin manifest、marketplace、dependency、hook event、agent frontmatter、skill frontmatter 是外部运行时契约，必须由 official docs + installed CLI + tests 共同验证。
- Long prompt logic should move into references and deterministic runtime helpers where possible; public `SKILL.md` should remain a router/coordinator surface.
- `/goal` condition must be transcript-verifiable because the official evaluator does not run tools or read files independently. curdx-flow 的 `goal-bridge` 已正确把 evidence protocol 转成 “conversation visibly shows” 条件。
- Completion state must be based on fresh evidence: checked tasks、exit code 0 verifier、snapshot/last-mile no blockers、capability-specific evidence，而不是 agent self-report。
- Architecture should keep Claude Code builtin autonomy layers distinct: `/goal` starts next turns by session-scoped evaluator; hooks enforce deterministic gates; subagents isolate context; plugin dependencies provide companion capabilities.

This suggests a PRD/architecture refactor target: make curdx-flow explicitly version-gate native `/goal`, expose a clear `--manual` fallback, and keep Stop hook from producing continuation prompts when `/goal` is active or intended.
_Source:_ Goals docs <https://code.claude.com/docs/en/goal>；Hooks docs <https://code.claude.com/docs/en/hooks>；Subagents docs <https://code.claude.com/docs/en/sub-agents>；本地 `plugins/curdx-flow/skills/help/SKILL.md`；本地 `src/hooks/lib/goal-bridge.ts`。
_Confidence:_ High。

### Scalability and Performance Patterns

curdx-flow 的 scalability 不是 request throughput，而是 **long-task reliability、context efficiency、turn cost control、parallel work isolation**。

Recommended patterns:

- Use native `/goal` for substantial work with measurable end state, but include turn/time bounds in the condition. Official docs explicitly recommend clauses like “or stop after 20 turns” and note a 4,000-character condition limit.
- Keep hook handlers cheap and deterministic; expensive reasoning belongs in skills/agents or native `/goal` turns.
- Use subagents for high-volume codebase exploration and independent slices; official subagents run in separate context windows and can preserve main conversation context.
- Use worktree isolation for independent write-heavy slices only when ownership can be cleanly separated; avoid unnecessary worktree fan-out for tightly coupled plugin manifest/hooks/state changes.
- Enforce iteration caps (`maxGlobalIterations`, `maxTaskIterations`, `--goal-turns`) in runtime state and goal condition. The current `auto-policy` and `goal-bridge` already model this.

Architectural implication: curdx-flow should treat `/goal` as an execution loop, not as a planning substitute. The planning/spec/review artifacts still define the measurable end state; `/goal` only drives repeated turns until evidence is visible.
_Source:_ Goals docs <https://code.claude.com/docs/en/goal>；Subagents docs <https://code.claude.com/docs/en/sub-agents>；Worktrees docs <https://code.claude.com/docs/en/worktrees>；本地 `src/hooks/lib/auto-policy.ts`；本地 `src/hooks/lib/goal-bridge.ts`。
_Confidence:_ High。

### Integration and Communication Patterns

The core architectural integration pattern is **single coordinator, many bounded workers, deterministic verification**:

- Main coordinator reads route/snapshot/last-mile and dispatches phase agents.
- Agents return exact markers and evidence, not trusted state changes.
- Hooks inject compact context and enforce hard gates.
- `/goal` drives follow-up turns from a transcript-visible condition.
- Plugin dependencies and external MCPs are capability providers, not embedded implementation.

The `/goal` addition changes curdx-flow’s architecture because the Stop hook should no longer be responsible for continuing execution. Local code already reflects this: `stop-watcher.ts` says native `/goal` is the execution driver and allows stop when execution remains in progress, leaving next turns to `/goal` or later `/curdx-flow:implement`. This is aligned with official docs comparing `/goal`, `/loop`, and Stop hooks: `/goal` starts the next turn after the previous turn finishes and stops when model evaluation confirms the condition; a Stop hook starts after the previous turn and stops when custom logic decides.
_Source:_ Goals docs <https://code.claude.com/docs/en/goal>；Hooks docs <https://code.claude.com/docs/en/hooks>；本地 `src/hooks/stop-watcher.ts`；本地 `plugins/curdx-flow/references/context-and-dispatch-policy.md`。
_Confidence:_ High。

### Security Architecture Patterns

Security architecture should focus on **trust boundaries in autonomy**:

- `/goal` evaluator reads conversation transcript and uses the configured small fast model; it does not call tools. Therefore sensitive data must not be surfaced unnecessarily just to satisfy the evaluator.
- `/goal` requires trusted workspace and hooks availability. Official docs state it is unavailable if `disableAllHooks` or managed `allowManagedHooksOnly` blocks it. curdx-flow must report this as a capability condition, not a workflow failure.
- Plugin subagents from plugins ignore `hooks`, `mcpServers`, and `permissionMode`; any architecture depending on those fields for plugin-shipped agents is invalid.
- External MCPs carry prompt injection and trust risks; curdx-flow should recommend and gate them, not silently push sensitive context into them.
- Hook output must avoid leaking prompts, memory, MCP responses, env vars, or file contents. Since `/goal` evaluates transcript-visible content, only minimal evidence should be printed.

Architectural implication: evidence protocol should include concise verifier commands/results, not raw logs or secrets. `/goal` conditions should ask for visible proof, but not force broad transcript dumps.
_Source:_ Goals docs <https://code.claude.com/docs/en/goal>；MCP docs <https://code.claude.com/docs/en/mcp>；Subagents docs <https://code.claude.com/docs/en/sub-agents>；Hooks docs <https://code.claude.com/docs/en/hooks>。
_Confidence:_ High。

### Data Architecture Patterns

Data architecture should center on **schema-compatible state + transcript-visible evidence + append-only observability**:

- `.curdx-state.json` should remain the source for workflow phase/task/policy state.
- `verificationBlocks` should store fresh evidence and exit codes.
- `.curdx/brain.jsonl` should store bounded recovery/last-mile events.
- Native `/goal` condition/status lives in the Claude session transcript, not in curdx-flow state. curdx-flow should store enough `autoPolicy` and goal bridge inputs to regenerate or explain the goal condition, but should not pretend it owns Claude Code’s active goal lifecycle.
- On resume, official `/goal` restores only if it was still active when session ended, and resets turn count/timer/token baseline. curdx-flow resume/status should not assume previous achieved/cleared goals remain active.

Architectural implication: `curdx-flow status` / `doctor` should distinguish “autoPolicy says executionDriver=goal” from “native `/goal` is currently active and supported.” Those are different facts.
_Source:_ Goals docs <https://code.claude.com/docs/en/goal>；本地 `src/hooks/_shared/types.ts`；本地 `src/hooks/lib/workflow-snapshot.ts`；本地 `src/hooks/lib/goal-bridge.ts`。
_Confidence:_ Medium-High：official `/goal` lifecycle is documented; local status integration is a recommended improvement.

### Deployment and Operations Architecture

Operational architecture must add `/goal` to existing release/doctor gates:

- Minimum Claude Code version for native `/goal` should be checked. Official docs state v2.1.139+; current local `2.1.142` satisfies this prerequisite.
- `curdx-flow doctor` should report `/goal` availability separately from plugin validation, hook freshness, external MCP availability, and tag parity.
- Release smoke should cover both paths:
  - native `/goal` available: `/curdx-flow:implement` produces or instructs a valid `/goal` condition and Stop hook does not fight it.
  - native `/goal` unavailable in another environment: `--manual` or fallback resume flow remains usable and does not claim unsupported autonomy.
- `goal-bridge` output must respect the documented 4,000-character condition limit and keep evidence transcript-visible.
- Non-interactive mode is relevant for future CI/release automation because official docs support `claude -p "/goal ..."` running to completion, but this should be introduced only after version gating, cost/turn bounds, and redacted evidence policy are solid.

Architectural implication: `/goal` should be a first-class capability in curdx-flow’s routing/doctor/help surfaces, similar to plugin dependencies and external MCPs, with states such as `available`, `needs-claude-update`, `hooks-disabled`, `managed-hooks-only`, and `manual-fallback`.
_Source:_ Goals docs <https://code.claude.com/docs/en/goal>；Commands docs <https://code.claude.com/docs/en/commands>；本地 `plugins/curdx-flow/skills/help/SKILL.md`；本地 `src/hooks/lib/runtime-cli.ts`。
_Confidence:_ High for requirement and command behavior; Medium for proposed capability-state taxonomy.

---

## Implementation Approaches and Technology Adoption

### Technology Adoption Strategies

Native `/goal` should be adopted as a **capability-gated execution driver**, not as an unconditional replacement for curdx-flow’s existing execution workflow. Official docs require Claude Code v2.1.139+; current local CLI is `2.1.142`, so the local prerequisite is satisfied. The implementation strategy should still be gradual because other user environments and hook settings may differ:

1. **Detect:** add deterministic `/goal` support detection to runtime doctor/goal bridge. Detection should report `available`, `needs-claude-update`, `hooks-disabled`, `managed-hooks-only`, or `unknown`.
2. **Gate:** `/curdx-flow:implement` should only present native `/goal` as unattended driver when detection is positive. Otherwise it should fall back to `--manual` semantics and explain why.
3. **Preserve:** keep `.curdx-state.json::executionDriver` and `autoPolicy.executionDriver` so workflows can distinguish intended driver from actual availability.
4. **Verify:** add smoke coverage for goal-supported, update-needed, and hooks-disabled environments.
5. **Defer CI automation:** non-interactive `claude -p "/goal ..."` is documented, but should not become a release gate until version detection, cost bounds, and transcript evidence redaction are reliable.

This is safer than a big-bang rewrite because it preserves working manual/resume behavior while allowing new Claude Code autonomy to take over where supported.
_Source:_ Goals docs <https://code.claude.com/docs/en/goal>；Commands docs <https://code.claude.com/docs/en/commands>；本地 `src/hooks/lib/goal-bridge.ts`；本地 `plugins/curdx-flow/skills/implement/SKILL.md`。
_Confidence:_ High。

### Development Workflows and Tooling

Implementation should follow a source-first workflow:

- `src/hooks/lib/goal-bridge.ts` should own goal-condition construction and capability warnings.
- `src/hooks/lib/runtime-cli.ts` should expose goal and doctor JSON surfaces for skills and tests.
- `plugins/curdx-flow/skills/implement/SKILL.md` should remain the coordinator instructions surface, but it should not hardcode autonomy assumptions before checking `/goal` availability.
- `src/hooks/stop-watcher.ts` should remain a hard-gate/cleanup hook, not a continuation driver when native `/goal` is active or intended.
- `scripts/claudecc-smoke.mjs` should validate generated plugin runtime from temp dirs and should add goal bridge assertions without requiring a real long-running `/goal` unless the local Claude version supports it.

Recommended implementation tasks:

1. Add a `goalCapabilityDoctor()` helper that shells out to `claude --version` and checks settings conditions where discoverable.
2. Add `goal` capability output to `curdx-flow doctor --json`.
3. Include `nativeGoal` in `curdx-flow goal` output with `supported`, `reason`, `requiredVersion`, `detectedVersion`, and `fallback`.
4. Update `/curdx-flow:implement` to tell users to run the `slashCommand` only when `supported === true`; otherwise route to manual/resumable execution.
5. Update help text to say `/goal` is preferred when available, not universally guaranteed.

_Source:_ Goals docs <https://code.claude.com/docs/en/goal>；Plugin reference <https://code.claude.com/docs/en/plugins-reference>；本地 `src/hooks/lib/runtime-cli.ts`；本地 `scripts/claudecc-smoke.mjs`。
_Confidence:_ High for workflow surfaces; Medium for exact settings detection until explored in code/CLI.

### Testing and Quality Assurance

Testing should avoid brittle dependence on live long-running `/goal` loops. The quality strategy should split deterministic contract tests from real Claude smoke:

- Unit tests: goal condition length <= 4000, transcript-visible evidence protocol, max-turn clause, active/inactive spec behavior, warning generation.
- Runtime CLI tests: `curdx-flow goal --json` shape, `needs-claude-update` detection, manual fallback message, doctor `nativeGoal` status.
- Hook tests: Stop hook does not emit continuation prompt during execution when native goal driver is expected; hard gates still block.
- Smoke tests: in temp plugin dir, validate `claude plugin validate`, runtime route/doctor/goal surfaces, and condition output. If installed Claude is below v2.1.139 in another environment, assert update guidance/fallback instead of failing the whole smoke.
- Release tests: do not require `/goal` to complete a real task unless explicitly running an environment with supported Claude Code version and accepted workspace trust.

Official `/goal` docs say the evaluator only judges surfaced transcript content; therefore tests must require the coordinator to print verifier commands/results and not rely on hidden file reads.
_Source:_ Goals docs <https://code.claude.com/docs/en/goal>；Hooks docs <https://code.claude.com/docs/en/hooks>；本地 `tests/hooks/*` pattern；本地 `scripts/claudecc-smoke.mjs`。
_Confidence:_ High。

### Deployment and Operations Practices

Operations should treat native `/goal` as one more runtime capability, similar to external MCP readiness and plugin dependency readiness:

- `curdx-flow doctor` should include `nativeGoal.ready`.
- `doctor.ok` should not be false solely because `/goal` needs a Claude update unless the selected route requires unattended execution.
- Release-facing work should still be blocked by plugin validation, hook freshness, version parity, smoke, release tag parity, and user-success evidence; `/goal` support enhances execution but does not replace release gates.
- Help/status should clearly surface: “native `/goal` unavailable in this environment; use `/curdx-flow:implement --manual` or upgrade Claude Code.”
- Because `/goal` relies on the hooks system, settings such as `disableAllHooks` and managed `allowManagedHooksOnly` must be treated as operational blockers for unattended goal execution.

Implementation should also avoid printing raw logs/secrets just to satisfy `/goal`; use concise verifier summaries and exit codes.
_Source:_ Goals docs <https://code.claude.com/docs/en/goal>；Hooks docs <https://code.claude.com/docs/en/hooks>；本地 `src/hooks/lib/runtime-cli.ts` doctor implementation。
_Confidence:_ High。

### Team Organization and Skills

For subsequent PRD/architecture work, responsibilities should be split cleanly:

- Product requirement: define when curdx-flow should prefer `/goal`, when it should fall back, and what user-facing messaging is acceptable.
- Architecture: define capability detection contract and state model (`nativeGoal` vs `executionDriver`).
- Implementation: update runtime CLI, goal bridge, implement skill, Stop hook tests, smoke tests.
- QA/release: test supported goal versions, update-needed environments, hooks-disabled environments, plugin install/update path, and state resume.

AI agents working on this should not be allowed to “just update prompts.” `/goal` integration touches runtime code, hook behavior, help text, smoke tests, and user-facing fallback semantics.
_Source:_ Goals docs <https://code.claude.com/docs/en/goal>；本地 `_bmad-output/project-context.md`；本地 `plugins/curdx-flow/references/context-and-dispatch-policy.md`。
_Confidence:_ Medium-High。

### Cost Optimization and Resource Management

`/goal` introduces a new cost/turn loop. Official docs say evaluation uses the configured small fast model and is typically negligible compared with main-turn spend, but curdx-flow still needs explicit bounds:

- Include `or stop after N turns` in every generated condition.
- Keep `--goal-turns` default aligned with `maxGlobalIterations`.
- Preserve pre-dispatch cost runaway caps in coordinator logic.
- Do not use `/goal` for direct low-risk one-shot edits when a single turn is enough.
- Keep conditions compact and task-specific; 4,000-character cap should be enforced by `goal-bridge`.

This keeps `/goal` from becoming a hidden infinite-loop or budget-surprise mechanism.
_Source:_ Goals docs <https://code.claude.com/docs/en/goal>；本地 `src/hooks/lib/auto-policy.ts`；本地 `src/hooks/lib/goal-bridge.ts`。
_Confidence:_ High。

### Risk Assessment and Mitigation

Major implementation risks and mitigations:

| Risk | Impact | Mitigation |
| --- | --- | --- |
| User environment has Claude version below v2.1.139 | `/goal` command unavailable | ask user to run `claude update`; fallback to manual/resume until updated |
| Hooks disabled or managed hooks only | `/goal` unavailable because it uses hooks | doctor reports blocker; implement uses `--manual` |
| Stop hook and `/goal` both continue work | duplicate autonomous loops | Stop hook remains gate/cleanup only |
| Goal evaluator cannot see proof | false non-completion or false completion | require transcript-visible verifier evidence |
| Condition exceeds 4,000 chars | command fails or truncates badly | compact in `goal-bridge`, warn when shortened |
| Raw evidence leaks secrets | privacy/security incident | print concise redacted evidence, never raw MCP/memory/env dumps |
| Smoke tests assume every environment supports `/goal` | false CI failure | assert update guidance/fallback when Claude is older than v2.1.139 |
| Users think `/goal` replaces spec/review | lower quality execution | keep specs/tasks/reviews as source of completion criteria |

_Source:_ Goals docs <https://code.claude.com/docs/en/goal>；Hooks docs <https://code.claude.com/docs/en/hooks>；本地 `src/hooks/stop-watcher.ts`；本地 `plugins/curdx-flow/skills/implement/SKILL.md`。
_Confidence:_ High。

## Technical Research Recommendations

### Implementation Roadmap

1. **Goal capability detection:** add deterministic detection to runtime CLI and doctor.
2. **Goal bridge hardening:** include support metadata, detected version, fallback action, and compact condition warnings.
3. **Implement skill correction:** present `/goal` as preferred when available; otherwise use manual execution without implying unattended continuation.
4. **Stop hook invariant:** keep Stop hook from injecting continuation prompts; add regression tests around this boundary.
5. **Smoke coverage:** update `scripts/claudecc-smoke.mjs` to assert goal bridge output and fallback on Claude <2.1.139.
6. **Release docs/help:** update `/curdx-flow:help` and project context rules after implementation.
7. **Optional future automation:** only after the above, evaluate `claude -p "/goal ..."` for non-interactive release/implementation smoke.

### Technology Stack Recommendations

- Keep Node/TypeScript ESM as the deterministic runtime layer.
- Keep Claude Code plugin contracts in manifest/hooks/skills/agents and validate them with the installed Claude CLI.
- Treat native `/goal` as an optional capability until minimum Claude Code version and hooks settings are verified.
- Continue using JSON state/schema and generated bundled hooks as release artifacts.

### Skill Development Requirements

- Agents must understand `/goal` vs Stop hook vs auto mode. They are complementary, not interchangeable.
- Implementers must know that `/goal` evaluator sees transcript only and cannot run tools.
- Reviewers must check fallback behavior for old Claude Code versions and hooks-disabled environments.
- Release agents must keep npm tag and plugin tag parity separate from `/goal` support.

### Success Metrics and KPIs

- `curdx-flow doctor --json` reports native `/goal` capability accurately.
- `curdx-flow goal --json` produces a valid condition under 4,000 chars with evidence protocol and support/fallback metadata.
- `/curdx-flow:implement` behaves correctly in both `/goal` supported and unsupported environments.
- Stop hook never creates a competing continuation loop.
- Smoke tests pass on current local Claude Code 2.1.142 by asserting native `/goal` support, while separate tests cover update-needed fallback.
- Release validation continues to verify plugin install/update, dependencies, hooks, generated artifacts, and tag parity.

---

## Research Synthesis

# Native-Goal-First Claude Code Plugin Architecture for curdx-flow

## Executive Summary

`curdx-flow` 的核心优化方向应明确升级为 **native `/goal` first-class 的 Claude Code 插件架构**。官方 `/goal` 文档确认该能力从 Claude Code `v2.1.139+` 可用，能够通过 session-scoped completion condition 驱动多 turn 工作；本机已更新到 `2.1.142`，因此当前开发环境满足前置条件。对 curdx-flow 来说，这意味着 Stop hook 不应继续承担 continuation loop，而应退回 deterministic hard gate、cleanup、evidence verification 的职责。

技术上，`curdx-flow` 应被治理为四层产品：Claude Code plugin shell、Node/TypeScript deterministic runtime、model-driven phase agents、native `/goal` execution driver。`plugins/curdx-flow` 是交付产品面，`src/hooks/**` 和 `scripts/build-hooks.mjs` 是生成 runtime artifacts 的源头，release 需要同时满足 npm `vX.Y.Z` 和 Claude plugin `curdx-flow--vX.Y.Z` 两个发布面。

战略上，下一阶段不建议直接“重写所有 prompt”。应先把 `/goal`、doctor、goal bridge、Stop hook invariant、plugin dependency trust、external MCP degradation、installed-plugin smoke、tag parity、state migration 这些契约收敛成可测试代码和发布门禁，再决定哪些 skill/agent 文本需要重构。

**Key Technical Findings:**

- Native `/goal` 是 curdx-flow 长任务执行的正确默认驱动；Stop hook 应避免产生第二套自治循环。
- `/goal` evaluator 不运行工具、不读文件，只判断 transcript 中 Claude 已展示的证据；因此 verifier output、exit code、snapshot/last-mile gates 必须显式出现在对话中。
- 官方 `/goal` condition 上限为 4,000 字符，并应包含 turn/time bound，例如 `or stop after N turns`。
- `pua`、`claude-mem`、`chrome-devtools-mcp`、`ui-ux-pro-max` 是 Claude plugin dependencies；`context7`、`sequential-thinking` 是 expected external MCP，不应伪装成 plugin dependencies。
- Cross-marketplace plugin dependencies 依赖 repo-root `.claude-plugin/marketplace.json` 的 `allowCrossMarketplaceDependenciesOn`，这是安装/发布关键边界。
- Plugin agents 不应依赖 `hooks`、`mcpServers`、`permissionMode` frontmatter；这些字段不是 plugin-shipped agents 的可靠运行时契约。
- Release confidence 不能只来自 CI 或 unit tests；必须包含 plugin validation、installed-plugin smoke、hook freshness、generated artifact freshness、dependency degradation、tag/version parity。

**Top Technical Recommendations:**

1. 将 native `/goal` 作为 `/curdx-flow:implement` 的默认长任务驱动，并保留 `--manual` fallback。
2. 在 `curdx-flow doctor --json` 和 `curdx-flow goal --json` 中加入 first-class `nativeGoal` capability 状态。
3. 保持 Stop hook 为 hard gate / cleanup / verification surface，不再注入 continuation prompt。
4. 强化 `goal-bridge`：输出 `supported`、`requiredVersion`、`detectedVersion`、hooks/settings blockers、fallback action、condition length warnings。
5. 把 release gate 扩展到 npm tag、plugin tag、plugin validation、installed-plugin smoke、dependency trust、external MCP degradation。

## Table of Contents

1. Research Methodology
2. Current Technical Landscape
3. Architecture Synthesis
4. Integration Synthesis
5. Native `/goal` Execution Model
6. Release and Operations Model
7. Security and Trust Model
8. Implementation Roadmap
9. Risk Assessment
10. Source Verification

## 1. Research Methodology

本研究使用官方 Claude Code 文档、当前安装的 Claude CLI、本仓库 package/manifest/hooks/registry/scripts 作为事实来源。官方文档来源包括：

- Claude Code `/goal`: <https://code.claude.com/docs/en/goal>
- Claude Code plugins: <https://code.claude.com/docs/en/plugins>
- Plugins reference: <https://code.claude.com/docs/en/plugins-reference>
- Plugin dependencies: <https://code.claude.com/docs/en/plugin-dependencies>
- Hooks: <https://code.claude.com/docs/en/hooks>
- Skills: <https://code.claude.com/docs/en/skills>
- MCP: <https://code.claude.com/docs/en/mcp>
- Subagents: <https://code.claude.com/docs/en/sub-agents>

本地事实来源包括 `package.json`、`plugins/curdx-flow/.claude-plugin/plugin.json`、repo-root `.claude-plugin/marketplace.json`、`plugins/curdx-flow/hooks/hooks.json`、`src/hooks/lib/goal-bridge.ts`、`src/hooks/stop-watcher.ts`、`src/hooks/lib/runtime-cli.ts`、`src/registry/capabilities.ts`、`scripts/claudecc-smoke.mjs` 和 `_bmad-output/project-context.md`。

## 2. Current Technical Landscape

curdx-flow 是 Node/TypeScript ESM CLI 与 Claude Code plugin bundle 的组合产品。npm CLI 负责 install/update/status/doctor/analyze 等本地命令，Claude Code plugin 负责用户在 Claude Code 中调用 `/curdx-flow:*` skills、agents、hooks 和 dependency wheels。

当前架构已经具备较好的基础：TypeScript source 是 canonical source，hook bundles 是 committed shipping artifacts，registry/capabilities 已区分 plugin dependencies 与 external MCP，`goal-bridge` 已存在，Stop hook 已有“native `/goal` 是 execution driver”的注释和行为倾向。

主要缺口不是技术栈选型，而是 contract hardening：`nativeGoal` capability detection、installed-plugin smoke、goal-supported smoke、hooks-disabled fallback、release parity、state migration、plugin dependency trust、external MCP degradation 需要成为代码和测试的一部分。

## 3. Architecture Synthesis

推荐目标架构：

```text
User goal
  -> /curdx-flow:start / :implement skill
  -> runtime route/snapshot/last-mile/goal
  -> native /goal drives turns when available
  -> coordinator delegates to phase agents
  -> agents return exact markers + evidence
  -> hooks enforce hard gates and inject compact context
  -> runtime doctor/smoke/release gates verify product health
```

关键边界：

- Skills coordinate and route; they should not become huge monolithic implementation manuals.
- Agents execute bounded expert work and return protocol markers; markers are not truth until verified.
- Hooks must be deterministic, cheap, fail-open unless enforcing explicit gate, and stdout-safe.
- `/goal` owns repeated follow-up turns for long implementation work.
- Doctor and smoke tests own environment truth: plugin validation, dependencies, MCP readiness, native `/goal`, release parity.

## 4. Integration Synthesis

curdx-flow should integrate, not vendor:

- Plugin dependencies: `pua@pua-skills`、`claude-mem@thedotmack`、`chrome-devtools-mcp@chrome-devtools-plugins`、`ui-ux-pro-max@ui-ux-pro-max-skill`
- External MCP: `context7`、`sequential-thinking`
- Workflow gates: docs query、browser verification、TDD cycle、security review、stack-specific verification

The repository should keep dependency declarations aligned across `src/registry/capabilities.ts`、`src/registry/plugins/*`、`plugins/curdx-flow/.claude-plugin/plugin.json`、repo-root `.claude-plugin/marketplace.json`、runner tests and smoke coverage.

## 5. Native `/goal` Execution Model

Official `/goal` semantics matter:

- `/goal` requires Claude Code `v2.1.139+`; local version is now `2.1.142`.
- One goal can be active per session.
- The evaluator uses conversation transcript, not tools or file reads.
- A condition may be up to 4,000 characters.
- Include turn/time bounds for cost control.
- `/goal` is unavailable if hooks are disabled or managed hooks policy blocks it.
- Active goals restore on resume only if still active; achieved/cleared goals do not restore.

curdx-flow implication:

- Generate `/goal` conditions from deterministic state and evidence protocol.
- Print concise evidence into transcript: task status, verifier command, exit code, snapshot/last-mile gate status.
- Keep `--goal-turns` aligned with `maxGlobalIterations`.
- Use `--manual` only as fallback or explicit user choice.
- Do not rely on Stop hook continuation when `/goal` is the driver.

## 6. Release and Operations Model

Release is multi-surface:

- npm release tag: `vX.Y.Z`
- Claude plugin dependency tag: `curdx-flow--vX.Y.Z`
- npm package: `@curdx/flow`
- Claude plugin source: `plugins/curdx-flow`
- marketplace trust: repo-root `.claude-plugin/marketplace.json`
- plugin validation: `claude plugin validate ./plugins/curdx-flow`
- smoke: `CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`
- local release gate: `npm run verify`

Operationally, `curdx-flow doctor` should report at least:

- plugin health
- hook freshness
- release version/tag parity
- external MCP readiness
- plugin dependency readiness where discoverable
- native `/goal` readiness
- browser verification readiness
- active spec/gates/next action

## 7. Security and Trust Model

The main security risks are permission widening, MCP trust, prompt/context leakage, hook blocking, shell execution, and release tag confusion.

Security requirements:

- No `allowed-tools: "*"` in shipped skills.
- Mutating public skills keep `disable-model-invocation: true`.
- Do not log prompts, memory payloads, MCP responses, env vars, or file contents by default.
- Do not add plugin-local `.mcp.json` for expected external MCPs unless the product model changes.
- Do not rely on unsupported plugin-agent frontmatter.
- Do not print raw evidence just to satisfy `/goal`; print redacted verifier summaries.

## 8. Implementation Roadmap

**Phase 1: Native Goal Capability Hardening**

- Add `nativeGoal` capability detection to runtime CLI.
- Add `nativeGoal` to `doctor`.
- Extend `goal-bridge` output with support metadata and fallback action.
- Add tests for version supported, update-needed, hooks-disabled/managed settings where detectable.

**Phase 2: Implement Flow Correction**

- Update `/curdx-flow:implement` to branch on `nativeGoal.supported`.
- Keep `/goal` as default when supported.
- Keep `--manual` as explicit fallback.
- Ensure Stop hook never starts competing continuation.

**Phase 3: Smoke and Release Gates**

- Extend `scripts/claudecc-smoke.mjs` to assert goal bridge output.
- Add installed-plugin behavior checks for primary slash-command workflow.
- Add release tag parity and plugin dependency resolution evidence.

**Phase 4: Prompt and Reference Cleanup**

- Shorten public skill bodies where runtime helpers now encode policy.
- Move long rubrics to references.
- Keep protocol markers and evidence requirements stable.

## 9. Risk Assessment

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Stop hook and `/goal` both drive turns | duplicate autonomous loops | Stop hook remains gate/cleanup only |
| Goal evidence hidden in files only | evaluator cannot confirm completion | print concise verifier evidence to transcript |
| Condition too long | invalid or poor `/goal` behavior | enforce 4,000 char cap in `goal-bridge` |
| Hooks disabled | `/goal` unavailable | doctor reports blocker; implement uses manual fallback |
| Dependency marketplace trust missing | install/update failure | verify manifest + marketplace allowlist + smoke |
| One release tag missing | npm/plugin version drift | block on tag parity |
| State migration discards user context | broken upgrades | backward reads and unknown-field preservation |
| Raw logs leak sensitive data | privacy/security issue | redacted evidence-only output |

## 10. Source Verification

**Primary official sources:**

- `/goal`: <https://code.claude.com/docs/en/goal>
- Plugins: <https://code.claude.com/docs/en/plugins>
- Plugins reference: <https://code.claude.com/docs/en/plugins-reference>
- Plugin dependencies: <https://code.claude.com/docs/en/plugin-dependencies>
- Hooks: <https://code.claude.com/docs/en/hooks>
- Skills: <https://code.claude.com/docs/en/skills>
- MCP: <https://code.claude.com/docs/en/mcp>
- Subagents: <https://code.claude.com/docs/en/sub-agents>

**Local verification:**

- `claude --version` -> `2.1.142 (Claude Code)`
- `package.json` -> `@curdx/flow` v7.2.1, Node `>=20.12.0`, npm scripts
- `plugins/curdx-flow/.claude-plugin/plugin.json` -> plugin dependencies and agents
- `.claude-plugin/marketplace.json` -> cross-marketplace trust allowlist
- `plugins/curdx-flow/hooks/hooks.json` -> event wiring
- `_bmad-output/project-context.md` -> completed project rules baseline

## Technical Research Conclusion

curdx-flow should proceed to PRD and architecture with a clear thesis: **make native `/goal` the first-class long-task execution driver while keeping deterministic hooks, runtime state, doctor, smoke, and release gates as the safety system around it**.

This is not merely a prompt update. It is a product architecture change touching runtime CLI, hook behavior, skill instructions, smoke tests, doctor output, release validation, and user-facing fallback semantics.

**Next recommended BMad steps:**

1. Run `bmad-create-prd` for the curdx-flow native-goal-first plugin optimization.
2. Run `bmad-create-architecture` after PRD approval, using this research and `project-context.md` as inputs.
3. Create epics/stories around native goal capability, doctor/smoke hardening, release parity, and skill/reference cleanup.

**Technical Research Completion Date:** 2026-05-15
**Research Period:** Current comprehensive technical analysis
**Source Verification:** Official Claude Code docs plus installed Claude CLI and local repository evidence
**Technical Confidence Level:** High for documented Claude Code/plugin behavior; Medium-High for proposed curdx-flow implementation roadmap

_This comprehensive technical research document is the technical reference for the next PRD and architecture phases._

<!-- Content will be appended sequentially through research workflow steps -->

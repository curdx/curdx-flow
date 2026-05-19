# Stack Gap Audit — curdx-flow v7.3.x

**研究日期：** 2026-05-18
**研究模式：** Gap-fill（不是 greenfield 选型）
**输入基线：** `.planning/codebase/STACK.md`、`package.json`、`package-lock.json`、`plugins/curdx-flow/.claude-plugin/plugin.json`、`plugins/curdx-flow/hooks/hooks.json`
**与 SYNTHESIS.md 关系：** SYNTHESIS.md 覆盖**外部仓库提炼的功能性簇**（Cluster A-G）。本文件覆盖**内部已用 stack 的版本/schema/平台层盲点**，两者**正交**。

整体盲点严重度：**MEDIUM**。没有"立刻爆炸"的安全 advisory，但有 3 个 schema drift 风险、4 个被错过的官方 lifecycle event、1 个跨 major 落后的测试框架。

---

## Executive Summary（按 roadmap 杠杆排序）

| 顺位 | 盲点 | 严重度 | 决策 |
|---|---|---|---|
| 1 | Claude Code lifecycle events 从 14 涨到 21，curdx-flow 只用 10/29 | **HIGH** | 评估接入 SessionEnd / PreCompact / WorktreeCreate / ConfigChange / PostToolUseFailure |
| 2 | `SessionStart` 用 `matcher: "*"`，官方仅支持 `startup\|resume\|clear\|compact` | **HIGH** | schema drift，可能"看起来在跑实际从不触发" |
| 3 | vitest 落后 2 个 major（2.1.9 → 4.1.6），v4 砍掉 `poolOptions.forks` | **HIGH** | 不立刻升也要计划，否则 v3/v4 patch 不再回流 |
| 4 | TypeScript 5.9 → 6.0 已发布，6.0 是"最后的 JS 版本"、7.0 是 Go 原生重写 | **MEDIUM** | 短期 5.9 安全；中期评估 6.0 升级路径，为 7.0 提前做 `target` 调整 |
| 5 | esbuild 0.24.2 → 0.28.0，dev-server CORS / source-map URL 行为变 | **MEDIUM** | 升级风险低、收益清晰；建议 patch 跟进 |
| 6 | Node engines `>=20.12.0` — Node 20 在 2026-04 已 EOL | **MEDIUM** | 必须抬到 `>=22.x`，与最新 chrome-devtools-mcp 依赖项对齐 |
| 7 | citty 0.1.6 → 0.2.2 是 ESM-only + parseArgs 重写 | **LOW-MEDIUM** | curdx-flow 已是 ESM-only，升级面小；但要回归测试 subcommand 解析 |
| 8 | plugin.json 没用 `displayName` / `userConfig` / `mcpServers` 等新字段 | **LOW** | 渐进采纳；`mcpServers` inline 可能简化 npm installer 流程 |
| 9 | tsup 8.5.1 是最新，tsdown（Rolldown）正崛起 | **INFO** | 不动；标记为"未来 6 个月观察"项 |
| 10 | `@types/node` 22 → 25 漂移 | **LOW** | 跟随 Node engines 一起抬 |

---

## 1. Claude Code Lifecycle Events — 未利用面 🔴

**当前覆盖：** 10/29 events（UserPromptSubmit、UserPromptExpansion、PreToolUse、Stop、SessionStart、SubagentStart、TaskCompleted、PostToolBatch、PostCompact、StopFailure）

**官方 2026 完整列表确认有 29 个事件**（HIGH confidence — code.claude.com/docs/en/hooks 与 code.claude.com/docs/en/plugins-reference 一致）。Claude Code 自身把列表从 14 涨到 21+ 再到 29，新增的与 curdx-flow Core Value 最对齐的有：

| Event | 适合 curdx-flow 用来做什么 | Confidence |
|---|---|---|
| **`SessionEnd`** | spec 的 session-spec 绑定文件 (`.curdx/sessions/<id>.json`) 应在 session 结束时归档/清理；当前没有清理机制 | HIGH（官方 docs 明确） |
| **`PreCompact`** | curdx-flow 已有 PostCompact recorder，但 PreCompact 才是"在 context 被裁掉之前抢救关键状态"的窗口；matcher 区分 `manual\|auto` | HIGH |
| **`PostToolUseFailure`** | 当前 Stop/StopFailure 才捕获失败，PostToolUseFailure 可在工具级粒度拦截"伪完成"（call edit but failed → 不应进入下一任务） | HIGH |
| **`TaskCreated`** | 与 TaskCompleted 配对，可在 task **派发时**就强制 e2e validation 义务（Cluster A 的 task-planner E2E 表的天然落点） | HIGH |
| **`ConfigChange`** | matcher 包含 `skills` —— 如果用户/agent 中途改 settings.json 跳过 curdx-flow 的 hook，可以立即拦截。直接服务 Cluster A 的 "Config Protection" | HIGH |
| **`WorktreeCreate` / `WorktreeRemove`** | 如果 curdx-flow 未来要把 spec 隔离到 worktree（参考其他插件的 isolation: "worktree"），这是契约入口 | HIGH |
| **`PermissionRequest` / `PermissionDenied`** | iron-law 当前靠 Stop 兜底；PermissionRequest 可以"在权限弹窗时插入 spec 检查"，更早一拍 | HIGH |
| `InstructionsLoaded` | 可记录 CLAUDE.md 加载顺序，调试上下文污染 | MEDIUM |
| `CwdChanged` | 跨 spec 切换工作目录时清理 spec 上下文 | MEDIUM |
| `FileChanged` | 监听 `.curdx-state.json` 变化做实时一致性检查 | MEDIUM |

**建议（prescriptive）：**
- **必接（v8 主线）：** `SessionEnd`（清理）、`PreCompact`（与 PostCompact 配对）、`PostToolUseFailure`（伪完成拦截）、`ConfigChange`（Config Protection，Cluster A）
- **观察：** `TaskCreated`（与 Cluster A E2E 表配套实施）
- **不接：** `WorktreeCreate/Remove`、`Elicitation/ElicitationResult`、`Setup`、`TeammateIdle`、`Notification` —— 当前架构无 worktree、无 MCP elicitation、非 CI、非多 agent team

**Sources：** [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)、[Plugins Reference Hook Table](https://code.claude.com/docs/en/plugins-reference)

---

## 2. `SessionStart` Matcher Schema Drift 🔴

**当前：** `plugins/curdx-flow/hooks/hooks.json` line 60：
```json
"SessionStart": [{ "matcher": "*", ... }]
```

**官方 schema（HIGH confidence）：** `SessionStart` 只支持 4 个 matcher 值：`startup` / `resume` / `clear` / `compact`。**不存在通配符 `"*"`**。

**风险：**
- 如果 Claude Code 实现做严格 enum 校验：`load-spec-context.mjs` 在所有四种 session 启动情况下**都不会被触发**，意味着"session 启动注入 spec 上下文"功能可能从未真正生效，只是看起来配置了。
- 如果实现做宽松匹配（把 `*` 当无 matcher 处理）：今天能用，下次 Claude Code 收紧时悄无声息失效。

**建议（prescriptive，HIGH 优先级）：**
- **立即** 改为显式 4 个 entry（每个 matcher 一个对象），或干脆 **去掉 matcher 字段**（很多 event 不支持 matcher 时官方示例就是直接省略，配合 `SessionStart` 单一目的）。
- 加 contract test：在 `tests/contracts/` 里对 hooks.json 跑 ajv 校验，schema 从官方 [`@hesreallyhim/claude-code-json-schema`](https://github.com/hesreallyhim/claude-code-json-schema)（**非官方但维护得最全**）拉。Anthropic 自家不发 schema URL（已确认 `anthropic.com/claude-code/marketplace.schema.json` 不存在 / 是常见幻觉）。

**Sources：** [Hooks reference — SessionStart matchers](https://code.claude.com/docs/en/hooks)、[Unofficial JSON Schemas (hesreallyhim)](https://github.com/hesreallyhim/claude-code-json-schema)

---

## 3. vitest 跨 Major 落后 🔴

**Current：** `vitest@^2.1.9`（lockfile 2.1.9）
**Latest：** `4.1.6`（**HIGH confidence — npm registry 实测**）

**v2 → v4 关键 breaking（HIGH confidence — 来自官方 migration guide）：**
1. **`poolOptions` 整个被移除**，全部上拔为顶层选项。curdx-flow 的 `vitest.config.ts` 当前用 `pool: 'forks'`（无 `poolOptions.forks` 嵌套），所以"直接迁移成本低"，但如果以后想加 `isolate: false` / `singleFork` / `execArgv`，新 API 是 `maxWorkers: 1` + `isolate: false`，不是 `poolOptions.forks.singleFork: true`。
2. `VITEST_MAX_THREADS` / `VITEST_MAX_FORKS` → 统一为 `VITEST_MAX_WORKERS`
3. `threads.useAtomics` 已移除
4. **test/describe 的第三参数 options 对象不再支持** —— 必须用第二参数
5. **要求 Vite >= 6.0.0、Node.js >= 20**（curdx-flow Node 已对齐；Vite 是 vitest 自己拉的间接依赖，被动升级）

**直接影响 curdx-flow：**
- 当前 `vitest.config.ts` 只用 `pool: 'forks'` + `testTimeout: 5000`，**直接 bump 不会炸**。但 23 个 `test:*` 脚本是核心 verify gate 的命脉，任何静默行为变化都很危险。
- v2.x 已不在主线维护；**安全 patch 不会回流到 2.1.x**（virtual confidence — vitest 不发 LTS）

**建议：**
- 分两步：先 v2 → v3（中等成本，主要是 expect API 迁移），再 v3 → v4。或者**一次跳到 v4**，配 vitest official codemod（如果有）。
- 用一个独立的 PR + 跑全部 `npm run verify` gate 确认，再合主线。
- 短期不动也可以 —— 没有 known security advisory 强制升级。**风险只是技术债 + 失去新 features**（inline expect package、并发模式默认化）。

**Sources：** [vitest 4 Migration — pool rework](https://github.com/vitest-dev/vitest/issues/9563)、[vitest 4 official migration guide](https://vitest.dev/guide/migration.html)

---

## 4. TypeScript 5.9 → 6.0 已发布 🟡

**Current：** declared `^5.6.0`、resolved `5.9.3`
**Latest：** `6.0.3`（HIGH confidence — npm registry 实测 + Microsoft 官方 blog）

**6.0 关键变化（HIGH confidence — Microsoft DevBlogs）：**
- `moduleResolution: classic` **移除**（curdx-flow 用 `Bundler`，未受影响）
- `esModuleInterop` 和 `allowSyntheticDefaultImports` **强制 always-on**，无法关闭（curdx-flow 当前 tsconfig 没显式设，默认 false → **升级时行为可能变化**，需复测）
- `target: es3 / es5` 弃用，最低支持 `es2015`（curdx-flow 用 `ES2022`，无影响）
- `downlevelIteration` 设任何值都报 deprecation error（curdx-flow 没设，无影响）
- **`target` 默认从 `ES3` 改为 `ES2023`、`module` 默认 `ESNext`、`types` 默认空数组**（curdx-flow 都显式设了，无影响）
- 6.0 是**最后的 JS 实现版本**；7.0 是 Go 原生重写（号称 10x 速度）

**直接影响 curdx-flow：**
- 5.9 → 6.0 的实际 break 面非常窄，因 curdx-flow tsconfig 已是现代配置
- **必查项**：是否有源码依赖 `esModuleInterop: false` 行为（curdx-flow 看起来都是 `import { x } from 'foo'` 命名导入，应无影响）
- 6.0 build time 据 MS 报告 +20-50%（在 `types` 默认收紧后）—— curdx-flow 项目体量小，体感差异不大

**建议：**
- **不立即升**。等 6.0.x patch 稳定（至少 6.0.5+）再走 ^5.6.0 → ^6.0.0
- **现在做的**：在 `tsconfig.json` 显式设 `"esModuleInterop": true`，让行为今天就和 6.0 对齐，消除升级时的暗坑

**Sources：** [Announcing TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)、[TS 5.x → 6.0 Migration Guide gist](https://gist.github.com/privatenumber/3d2e80da28f84ee30b77d53e1693378f)

---

## 5. esbuild 0.24.2 → 0.28.0 🟡

**Current：** `^0.24.2`、resolved 0.24.2
**Latest：** `0.28.0`（HIGH confidence — npm registry）

**关键变化（MEDIUM confidence — 官方 CHANGELOG-2025.md 提到但摘要不完整）：**
- **0.25.0 CORS 收紧**：dev-server 不再支持 cross-origin（curdx-flow **不**用 dev-server，无影响）
- **0.25.0 source map sources 改为 URL 解释**（curdx-flow 用 `sourcemap: 'linked'`，路径可能从 file path 变 URL，需要回归测试 hook 调试链路）
- **0.27+ Uint8Array.fromBase64**：binary loader 默认用，未来需 `target: node22+` 否则降级（curdx-flow 当前 `target: node20`，无影响除非用 base64 loader）
- **0.28.0 fallback download integrity check**：安装时增加哈希校验（CI/CD 友好；curdx-flow 是 devDep，无 runtime 影响）
- **0.28.0 import text proposal**（TC39 stage 3）：`import txt from './x.txt' with { type: 'text' }`，curdx-flow 暂不需要

**直接影响 curdx-flow：**
- `scripts/build-hooks.mjs` 用的 API（`build()` + `platform: 'node'` + `format: 'esm'` + `packages: 'bundle'` + `sourcemap: 'linked'`）从 0.24 → 0.28 **没有 API 层 break**（基础 API 已稳定多年）
- **风险只在 source map URL 解释变化**：如果 hook bundle 的 source map 链接被任何工具消费（比如 stack trace 反解），需要测试一次

**建议：**
- 直接 bump `esbuild` 到 `^0.28.0` 并跑 `npm run build:hooks` + 全套 hook test (`npm run test:hooks`)
- 风险低、不抢任何路线图带宽

**Sources：** [esbuild CHANGELOG-2025](https://github.com/evanw/esbuild/blob/main/CHANGELOG-2025.md)、[Snyk esbuild security index](https://security.snyk.io/package/npm/esbuild)（无 active advisory）

---

## 6. Node.js Engines 必须抬 🟡

**Current：** `engines: { node: ">=20.12.0" }`、tsconfig `target: ES2022`
**实际状态（HIGH confidence — nodejs.org 与 endoflife.date 一致）：**
- **Node 20 已 EOL（2026-04 LTS 结束）**。当前 LTS = Node 22（Maintenance LTS）+ Node 24（Active LTS）
- Node 26 是 Current 非 LTS，2026-10 转 LTS
- Node 24 ships npm 11、stable `require(esm)`、稳定的 type stripping
- chrome-devtools-mcp 依赖 **Node >= 20.19**（已是 curdx-flow 依赖项之一，间接约束）

**直接影响 curdx-flow：**
- npm 安装时 `engines` 字段如果 `>=20.12.0` 仍写着，会**给出 Node 20 用户"还能装"的假信号**，但他们装完跑会撞到 Node 20 已停止接收 security patch 的实际风险
- 主分发面（hook bundle .mjs）跑在 **end-user Claude Code 的 Node 进程里**，end-user 大概率在 24+

**建议（prescriptive）：**
- `engines.node` 从 `>=20.12.0` 抬到 `>=22.11.0`（22 当前 maintenance LTS 起始 patch）
- tsup `target` 从 `node20` 抬到 `node22`
- esbuild build-hooks 同步 `target: 'node22'`
- `@types/node` 从 `^22.10.0` 抬到 `^22.18.0` 或 `^24.0.0`（@types/node 25.9.0 当前最新，但跟 runtime 对齐到 22/24 更稳）
- tsconfig `target` 可从 `ES2022` 升到 `ES2023`（与 TS 6.0 默认对齐；Node 22 完整支持）

**Sources：** [Node.js Releases](https://nodejs.org/en/about/previous-releases)、[Node.js endoflife](https://endoflife.date/nodejs)、[Node 22 vs 24 — PkgPulse 2026](https://www.pkgpulse.com/guides/nodejs-22-vs-nodejs-24-2026)

---

## 7. citty 0.1.6 → 0.2.2 ESM-only 重写 🟢

**Current：** `^0.1.6`、resolved 0.1.6
**Latest：** `0.2.2`（HIGH confidence — npm registry）

**v0.2 关键变化（MEDIUM confidence — GitHub releases）：**
- **ESM-only dist**（drops CJS）—— curdx-flow 已 `"type": "module"`，无影响
- **改用 `node:util.parseArgs`** 内部解析 —— **API 表面应保持，但边角行为可能变**
- 新增 subcommand aliases / plugin system / default subcommand / hidden command / enum 类型 / `negativeDescription`
- 修复：用户定义 `-h/--help/-v/--version` 不再被强占；arg 值按声明类型 coerce；subcommand resolution 不再吞 flag 值

**直接影响 curdx-flow：**
- `src/index.ts` 用 `citty` 跑 `install/uninstall/update/status/analyze/check` 六个 subcommand
- v0.2 API 表面**应**兼容 `defineCommand` / `runMain`，但 parseArgs 切换可能改变：
  - 未声明 args 的传递行为
  - boolean 类型 coercion
  - `--key=value` vs `--key value` 解析

**建议：**
- 不紧急。升级前先在 `tests/runner/` 加 CLI 端到端测试覆盖 6 个 subcommand 的关键 flag 路径
- 升级时**仔细看 parseArgs 行为差异**，可能需要补 type coercion 处理
- 收益不大（不缺 plugin / enum / alias），建议**延后到下一次 stack housekeeping 一起做**

**Sources：** [citty Releases](https://github.com/unjs/citty/releases)

---

## 8. plugin.json 新字段未声明 🟢

**当前 plugin.json 已声明：** `name`、`version`、`description`、`author`、`homepage`、`repository`、`license`、`keywords`、`dependencies`、`skills`、`agents`

**官方 2026 schema 完整字段（HIGH confidence — code.claude.com/docs/en/plugins-reference）支持但 curdx-flow 未用：**

| 字段 | 用途 | curdx-flow 是否值得加 |
|---|---|---|
| `$schema` | 编辑器 autocomplete + 校验 | 加（low cost），但要指向社区 schema 因官方不提供 |
| `displayName` | UI 显示用人类可读名（要 Claude Code v2.1.143+） | 加：`"Curdx Flow"` —— v2.1.143 已半年前发布，end-user 应都在更新版本 |
| `mcpServers` (inline) | 把 context7 / sequential-thinking 直接打进 plugin 而非走 npm CLI `claude mcp add` | **战略性变化**：当前流是"npm installer 用 `claude mcp add` 注册到 user scope"，如果改 inline，MCP 跟着 plugin 生命周期自动启停，end-user 不需要装 npm 包。但**会和 npm installer 流程冲突**（双重注册）。需要决策。 |
| `userConfig` | 替代用户手编 settings.json 的 prompt 流（type: string/number/boolean/directory/file，支持 sensitive） | 加：`CONTEXT7_API_KEY` 就是天然 candidate，type: string + sensitive: true，比现在 npm installer 自己 prompt 干净 |
| `channels` | Telegram/Slack/Discord 风格消息注入 | 不加，超出当前范围 |
| `outputStyles` | 自定义 output style | 不加 |
| `experimental.monitors` | session 期长跑后台命令、输出注入到 Claude 通知 | **可以考虑**：curdx-flow stop-watcher 当前是 hook reactive，monitor 可做"主动 polling .curdx-state.json"做实时一致性 |
| `experimental.themes` | 颜色主题 | 不加 |

**hooks 字段：**
- `hooks` 已用，无 gap
- `hooks.json` 顶层有非标准 `description` 字段（官方 schema 未列），Claude Code 应忽略但**不是契约保证**

**建议：**
- **必加：** `$schema`（用 [hesreallyhim/claude-code-json-schema](https://github.com/hesreallyhim/claude-code-json-schema) URL）、`displayName: "Curdx Flow"`
- **战略评估：** `userConfig` 接管 CONTEXT7_API_KEY 流，**砍掉** npm installer 里相应 prompt
- **战略评估：** `mcpServers` inline 取代 `claude mcp add` 调用 —— 需要先决策"npm installer 与 plugin 谁是 MCP 注册的真相源"
- **观察：** `experimental.monitors` 配合 `.curdx-state.json` 一致性检查（实验性，等稳定）

**Sources：** [Claude Code Plugins Reference — Complete Schema](https://code.claude.com/docs/en/plugins-reference)

---

## 9. tsup vs tsdown（Rolldown）🟢

**Current：** `tsup@^8.3.0`、resolved 8.5.1（**已是最新**，无版本 gap）

**生态信号（MEDIUM confidence — pkgpulse 2026 guide）：**
- tsdown（基于 Vite Rolldown）是 tsup 的"下一代继承者"，**3-10x 更快**、零摩擦迁移（多数情况就改个 import）
- tsup 仍是"安全大社区选择"
- unbuild（UnJS 系）适合 Nuxt/Nitro 生态

**直接影响 curdx-flow：**
- CLI bundle <= 84KB 的 NFR-3，tsup 已能稳定满足；速度差异在 curdx-flow 项目规模上不痛
- 切到 tsdown 仅收"快一点 + ESM-first 默认行为更干净"，但**zero-config 替换还在演进**，esm 兼容性边角案例需复测

**建议：**
- **不动**。tsup 是已知稳定路径
- 标记为"6 个月观察项"：等 tsdown 1.0 + tsup 维护频率明显下滑再评估

**Sources：** [tsup vs tsdown vs unbuild 2026](https://www.pkgpulse.com/guides/tsup-vs-tsdown-vs-unbuild-typescript-library-bundling-2026)、[Migrate from tsup — tsdown docs](https://tsdown.dev/guide/migrate-from-tsup)

---

## 10. ajv 8 → 9（未发布）🟢

**Current：** `ajv@^8.20.0`（resolved 8.20.0）+ `ajv-formats@^3.0.1`
**Latest：** `ajv` **8.20.0** —— **已是最新**；**ajv 9 尚未发布**（HIGH confidence — npm registry + GitHub releases 一致）

**结论：** **无 gap**。ajv 8 是当前主线、稳定、无 security advisory。`ajv-formats` 3.0.1 也是最新。

**Sources：** [Ajv npm](https://www.npmjs.com/package/ajv)、[Ajv releases](https://github.com/ajv-validator/ajv/releases)

---

## 11. tinyexec & picocolors & @clack/prompts 🟢

| Package | Current | Latest | 评估 |
|---|---|---|---|
| `tinyexec` | 1.1.1 | **1.1.2** | patch 落后，**无 security advisory**（Snyk 确认）。可顺手 bump |
| `picocolors` | 1.1.1 | **1.1.1** | **已对齐**，无 gap |
| `@clack/prompts` | 1.2.0 | **1.4.0** | minor 落后，**无 breaking change**（HIGH confidence — 官方 changelog 无 BREAKING 段）。新增 multiline prompt / groupMultiselect scrolling，可在 installer UX 上选择性利用 |
| `@clack/core` | 1.2.0 | **1.3.1** | 跟随 prompts 升级 |

**建议：**
- 一次性把 `tinyexec` / `@clack/prompts` / `@clack/core` 都 bump 到最新 minor/patch
- 风险窗口小、收益清晰、不影响接口

**Sources：** [tinyexec Snyk](https://security.snyk.io/package/npm/tinyexec)、[@clack/prompts releases](https://github.com/bombshell-dev/clack/releases)

---

## 12. pathe（milestone 提及但不在依赖中）🟢

**检查结论：** curdx-flow `package.json` **不依赖 `pathe`**（grep 全部依赖确认）。它可能是 milestone context 误植，或预留未来引入的考虑。当前 path 处理用 Node 内建 `node:path`（zero-dep，符合 hook bundle 约束），无需引入 pathe。

**建议：** 不引入。Node `node:path` + esbuild bundling 已经能 cover 跨平台路径需求。pathe 主要价值是"在 ESM/CJS 边界 + Windows 路径下行为更一致"，但 curdx-flow 是纯 ESM，没有这个 pain point。

---

## 13. 已对齐项（明确收敛 roadmap 范围）

以下项**已经在最佳实践面对齐**，不应进 roadmap：

- ✅ `picocolors` 已是最新
- ✅ `ajv` + `ajv-formats` 已是最新
- ✅ `tsup` 已是最新（8.5.1）
- ✅ npm lockfile v3 已是当前推荐
- ✅ Hook bundle 零运行时依赖（与上游 Anthropic 建议的 `${CLAUDE_PLUGIN_ROOT}` + 自包含 .mjs 模式一致）
- ✅ Hook exit-0 invariant（与官方 exit code 表对齐 —— 非 2、非 0 都是 non-blocking error）
- ✅ Version parity gate 4-file（package.json / lockfile / plugin.json / marketplace.json）—— 与官方"如果 plugin.json `version` 也在 marketplace entry，plugin.json wins"的规则不冲突
- ✅ Marketplace `allowCrossMarketplaceDependenciesOn` 已正确声明 4 个上游
- ✅ `${CLAUDE_PLUGIN_ROOT}` 路径变量在 hooks.json 中正确使用（exec form + args 数组，避免 quoting 问题）
- ✅ `homepage` / `repository` / `license` / `keywords` 已在 plugin.json 声明（之前 INTEGRATIONS.md 描述不全）

---

## Confidence Matrix

| 主题 | Confidence | 主要依据 |
|---|---|---|
| Lifecycle events 矩阵 | **HIGH** | code.claude.com 官方 docs 两处一致 + 多方第三方教程印证 |
| SessionStart matcher schema | **HIGH** | 官方 hooks docs 明确列出 4 个 matcher，无 `*` |
| vitest v2→v4 breaking | **HIGH** | 官方 migration guide + GitHub issue #9563 |
| TypeScript 6.0 变化 | **HIGH** | Microsoft DevBlogs 官方公告 |
| esbuild changelog 细节 | **MEDIUM** | 官方 CHANGELOG-2025.md 存在但 WebFetch 摘要不完整；具体 API 影响是低风险推断 |
| Node EOL 时间表 | **HIGH** | nodejs.org + endoflife.date 一致 |
| citty 0.2 行为变化 | **MEDIUM** | GitHub releases 摘要 + 第三方文章；具体 parseArgs 边角案例需实测 |
| plugin.json 完整 schema | **HIGH** | 直接读取官方 plugins-reference 完整章节 |
| 各包"已对齐"判定 | **HIGH** | npm registry `npm view <pkg> version` 实测 |

---

## 给 Roadmap 的 Prescriptive Recommendations

如果只能做 3 件事，按 Core Value（"Claude 走流程、不跳步、有证据"）杠杆排序：

1. **修 `SessionStart` matcher schema drift + 加 hooks.json contract test** — 直接服务"走流程"（如果 hook 没真触发，"走流程"是文字承诺）。**S 工作量。**
2. **接入 `PostToolUseFailure` + `ConfigChange` + `SessionEnd` 三个 lifecycle events** — `PostToolUseFailure` 让"伪完成"在工具级粒度就被拦截；`ConfigChange` 实现 Cluster A "Config Protection"；`SessionEnd` 收掉 session-spec 绑定文件泄漏。**M 工作量、与 Cluster A 直接配套。**
3. **抬 Node engines 到 `>=22.11.0` + esbuild/tsup 同步到 node22 target** — 收掉 Node 20 EOL 带来的 user-side 风险，同时为 Node 24 require(esm) 等新能力打开门。**S 工作量、纯版本对齐。**

vitest v4 升级和 TypeScript 6.0 升级建议**单独放一个"stack housekeeping"轻量 phase**，不挡 Cluster A/B 主线。

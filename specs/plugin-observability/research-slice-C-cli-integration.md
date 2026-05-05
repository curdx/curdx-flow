# Slice C — CLI Subcommand 集成方案

## 现有 CLI 架构

| 项 | 位置 |
|---|---|
| 入口 | `src/index.ts:1-178`，单文件 |
| CLI 框架 | `citty@^0.1.6`（`package.json:48`）— `defineCommand` + `runMain` |
| Bin | `package.json:6` `"bin": "./dist/index.mjs"` （根 bin，无 name → `npx @curdx/flow` 直接调用） |
| Build | `tsup.config.ts` ESM-only，target `node20`，`splitting:false`，`minify:false`，banner 加 `#!/usr/bin/env node` |
| 现有子命令 | `install` (`src/index.ts:28`)、`uninstall` (`:52`)、`update` (`:72`)、`status` (`:92`)；白名单数组 `SUBCOMMANDS` (`:106`) |
| 子命令实现 | 每个子命令委托到 `src/flows/<name>.ts`（如 `src/flows/status.ts:10-48`） |
| i18n | `src/i18n/{en,zh,index}.ts`，`t(key)` 调用，`initLanguage` 解析 `--lang` |
| 交互回退 | 无子命令时 `runInteractive` (`:143`) → `mainMenu()` |

## analyze 子命令插入点

- 新建 `src/flows/analyze.ts` （沿用 `flows/` 目录约定，与 `status.ts` 一比一对位）。
- `src/index.ts` 改动 4 处：(1) `import { analyzeFlow } from './flows/analyze.ts';`；(2) `defineCommand` 块（仿 `statusCmd`）；(3) `subCommands` 追加；(4) `SUBCOMMANDS.add('analyze')`（`src/index.ts:106`）。
- 解析逻辑独立模块：`src/analyze/{parser.ts, filter.ts, report.ts}` —— flow 只做编排，便于 vitest 单测每个纯函数。
- i18n key 加 `analyze.title` / `analyze.summary` 等到 `src/i18n/{en,zh}.ts`。

## 依赖评估

| 用途 | 推荐方案 | 理由 |
|---|---|---|
| 流式读 jsonl | `node:readline` + `node:fs` createReadStream | 标准库够，jsonl 一行一记录，文件可达数 MB → 必须流式，不能 `readFileSync` |
| 目录递归 | `fs.promises.readdir(..., { recursive: true })` (Node 20+) | 已 require `>=20.12.0` (`package.json:11`)，零依赖 |
| markdown 渲染 | 手写 string template | 报告结构固定（表格 + 列表），引模板引擎过重 |
| 日期处理 | `Date` + `--since=7d` 自实现 parse | 避免 `date-fns` / `dayjs` |
| 表格 | 现有 `picocolors` (`package.json:49`) 上色，markdown table 手写 | 终端版可选用 `picocolors`，文件版纯 md |

**零新增 dependency**。复用已装 `@clack/prompts`、`picocolors`。

## Build pipeline 影响

- 当前 `dist/index.mjs` 64674 字节、1708 行。新增 analyze 估增 8-15 KB（解析器 + 报告生成器纯 JS，无依赖）。
- `tsup.config.ts:10` `splitting:false` → 单文件输出，analyze 代码即使未调用也会进 bundle。可接受（< 100KB 总）。
- **Lazy load 建议**：`flows/analyze.ts` 内部 `await import('../analyze/parser.ts')`。citty 在子命令路由时已惰性，但 import 链全是静态，bundler 会全打包；动态 import 在 ESM 单文件下无意义。**不做 lazy-load**，直打包。
- 不需要改 `tsup.config.ts`。

## 输出体验设计

| 决策 | 方案 |
|---|---|
| 默认输出 | stdout（pipe 友好，配合 `> report.md`） |
| `--out <file>` | 显式写文件并 `p.note` 提示路径 |
| `--since <7d|30d|YYYY-MM-DD>` | 时间窗过滤，默认 30 天 |
| `--limit N` | 单段最多 N 行，默认 10 |
| `--project <name>` | 过滤特定 `~/.claude/projects/<dir>` |
| `--json` | 跳过 markdown，直出 JSON（仿 `status --json` `src/flows/status.ts:31`） |
| 大数据量 | 流式逐文件解析 → 内存累加器，全部读完一次性渲染（数据规模可控：单用户 < 100 MB jsonl） |

## 内置报告清单（建议起步 5 个）

1. **Hook 失败 Top-N**：`hook_failure events GROUP BY hookName ORDER BY count DESC`（来自 `~/.claude/curdx-flow/errors.jsonl` + jsonl 中 `hook_success` 的 stderr 非空记录）。
2. **Slash command 使用频次**：`type=user-prompt WHERE content LIKE '/curdx-flow:%' GROUP BY command`。
3. **Subagent 调度热度**：`tool_use WHERE name='Task' GROUP BY subagent_type`（追踪 research/requirements/design/tasks/implement 各 phase 调用占比）。
4. **Spec 完成漏斗**：扫 `specs/*/.curdx-state.json` 的 `phase` 分布 → 多少 spec 卡在哪个阶段。
5. **平均迭代轮数**：`specs/*/.curdx-state.json.iteration` 直方图（1 = 一次过；>5 = 难产）。

## 测试策略

- 现有测试只覆盖 hooks（`vitest.config.ts:5` `include: ['tests/hooks/**/*.test.ts']`），`tests/` 下只有 `hooks/` 子目录，**`src/` 当前零测试**。
- 跑命令：`npm run test:hooks`（`package.json:19`）。
- 新增 `tests/analyze/*.test.ts` 并扩 `vitest.config.ts` `include` 增加 `'tests/analyze/**/*.test.ts'`。
- Fixture 策略：`tests/analyze/fixtures/sample.jsonl` 5-10 行覆盖（user-prompt / tool_use / hook_success-with-stderr / file-history-snapshot / last-prompt），分别测 parser / filter / report 三层纯函数。
- Snapshot 测 markdown 输出（vitest 内置 `toMatchSnapshot`），稳态报告易回归。
- `package.json` script 加 `"test:analyze": "vitest run tests/analyze"`，`verify` 链路追加。

## Sources

- `/Users/wdx/opc/curdx-flow/src/index.ts:1-178`
- `/Users/wdx/opc/curdx-flow/src/flows/status.ts:1-48`
- `/Users/wdx/opc/curdx-flow/package.json:6,11,46-58`
- `/Users/wdx/opc/curdx-flow/tsup.config.ts:1-15`
- `/Users/wdx/opc/curdx-flow/vitest.config.ts:1-7`
- `/Users/wdx/.claude/projects/-Users-wdx-opc-curdx-flow/*.jsonl`（实地采样确认 schema）

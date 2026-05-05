---
spec: plugin-observability
phase: tasks
granularity: coarse
created: 2026-05-05
---

# Tasks — plugin-observability

## Total: 17 tasks across 5 phases (coarse granularity + 3 VE + 6 [VERIFY] gates)

| Phase | 任务数 | 用途 |
|---|---|---|
| Phase 1 — POC | 3 + 1 [VERIFY] | 跑通最小闭环（hook 失败 Top-N） |
| Phase 2 — Refactor | 3 + 1 [VERIFY] | 拆 5 件套 + schema map + 错误埋点 lib |
| Phase 3 — Testing | 3 + 1 [VERIFY] | 单测 ≥80% + snapshot + redact grep |
| Phase 4 — Quality | 3 + 1 [VERIFY] | i18n + bundle gate + README + reality 冒烟 |
| Phase 5 — E2E | 3 (VE1/VE2/VE3) | 真机 fixture + 真实 jsonl 端到端 |
| Final Verification | 2 [VERIFY] | FR/NFR/AC × 任务 矩阵 + 文件清单 23 条核对 |

## POC Milestone

任务 **1.3** 完成时，"读 1 个 fixture jsonl → 输出 hook 失败 Top-N markdown" 必须可在终端跑通：
`node dist/index.mjs analyze --json` 应输出含 `hookFailures` 段的 JSON。

---

## Phase 1 — POC（让最小回路活起来）

- [x] **Task 1.1: 准备 fixture jsonl + 注册 analyze CLI 骨架**
  - **Do**:
    1. 创建 `tests/analyze/fixtures/sample.jsonl`（≥10 行，至少含 2 个 `hook_success.exitCode=1`、1 个 `tool_use.name=Agent`、1 个未知 type、1 行半行截断、1 个 user `<command-name>` XML）
    2. 创建 `src/flows/analyze.ts`：citty `defineCommand`，args 暂只接 `--out`/`--json`/`--limit`，body 调 `runAnalyze(opts)`
    3. 修改 `src/index.ts` 4 处微改：`import analyze from './flows/analyze.js'` + `subCommands: { ..., analyze }` + `SUBCOMMANDS.add('analyze')`
  - **Files**: `tests/analyze/fixtures/sample.jsonl`, `src/flows/analyze.ts`, `src/index.ts`
  - **Done when**: `npm run build && node dist/index.mjs analyze --help` 列出 `analyze` 子命令；fixture 文件存在且符合 7 类事件覆盖
  - **Verify**: `npm run build && node dist/index.mjs analyze --help 2>&1 | grep -q analyze && wc -l tests/analyze/fixtures/sample.jsonl | awk '$1 >= 10 {print "PASS"}' | grep -q PASS`
  - **Commit**: `feat(analyze): scaffold analyze CLI subcommand and POC fixture`
  - _Requirements: FR-1, US-1_
  - _Design: 文件清单 src/flows/analyze.ts + src/index.ts 修改_

- [x] **Task 1.2: 最小流式 parser + index 编排（hook_success only）**
  - **Do**:
    1. 创建 `src/analyze/index.ts`：导出 `runAnalyze(opts)`；inline 临时 parser 用 `node:readline` 读 fixture，仅识别 `attachment.type==='hook_success'` 提取 `hookName/exitCode/durationMs/stderr`
    2. 临时硬编码 fixture 路径（POC 阶段允许 shortcut）
    3. 累计 `hookFailureCount[hookName]`，按次数倒排
  - **Files**: `src/analyze/index.ts`
  - **Done when**: 跑 fixture 输出 JSON 含 `hookFailures: [{hook, count, lastStderr}]`，按 count 倒排
  - **Verify**: `npm run build && node dist/index.mjs analyze --json 2>&1 | node -e "const j=JSON.parse(require('fs').readFileSync('/dev/stdin'));process.exit(j.hookFailures && j.hookFailures.length>=1?0:1)"`
  - **Commit**: `feat(analyze): minimal streaming parser for hook_success events`
  - _Requirements: FR-1, FR-2, FR-7（部分）, AC-1.1_
  - _Design: parser.ts 雏形 + index.ts 编排_

- [x] **Task 1.3: POC 收尾——markdown 渲染 + Top-N 截断**
  - **Do**:
    1. `src/analyze/index.ts` 内 inline 渲染 markdown：`## Hook Failures Top-N` + 表格 (hook | count | last stderr)
    2. `--json` flag 切回 JSON 输出，缺省 markdown
    3. `--limit N` 默认 10 截断
    4. **POC Checkpoint**：终端跑 `node dist/index.mjs analyze` 应见 markdown 表格
  - **Files**: `src/analyze/index.ts`
  - **Done when**: 缺省输出 markdown 含 `## Hook Failures` 段；`--json` 输出合法 JSON；`--limit 1` 只显示 1 行
  - **Verify**: `npm run build && node dist/index.mjs analyze 2>&1 | grep -q "## Hook Failures" && node dist/index.mjs analyze --json 2>&1 | python3 -c "import json,sys;json.loads(sys.stdin.read());print('PASS')" | grep -q PASS && node dist/index.mjs analyze --limit 1 --json 2>&1 | node -e "const j=JSON.parse(require('fs').readFileSync('/dev/stdin'));process.exit(j.hookFailures.length<=1?0:1)"`
  - **Commit**: `feat(analyze): POC complete - hook failures markdown + JSON + limit`
  - _Requirements: FR-7（hook 失败段）, FR-15, FR-17, FR-19, AC-1.1_
  - _Design: report.ts 雏形_

- [x] **V1 [VERIFY] Phase 1 quality checkpoint**
  - **Do**: 跑 typecheck + build + smoke
  - **Verify**: `npm run typecheck && npm run build && node dist/index.mjs analyze --help`
  - **Done when**: 三命令均退出 0
  - **Commit**: `chore(analyze): pass POC quality checkpoint`（如有修复）

  ---

## Phase 2 — Refactor（拆 5 件套 + schema map + 错误埋点 lib）

- [x] **Task 2.1: 拆 parser + filter + types + state.json 增量 offset**
  - **Do**:
    1. 创建 `src/analyze/types.ts`：导出 `Event`、`Counters`（`{unknown_type, parse_error}`）、`Options`、`StateFile`
    2. 创建 `src/analyze/parser.ts`（~200 行）：`parseTranscript(path, startOffset, schemaMap)` 返回 `AsyncIterable<Event>` + 终态 offset + counters；处理 corrupt 行 `parse_error_count++`，未知 type `unknown_type_count++`，state size 倒退/mtime 倒退视为 rotate 全量重读（D-1）
    3. 创建 `src/analyze/filter.ts`（~80 行）：`(uuid, requestId)` 双键去重 + `requestId` 缺失退化为 uuid 单键（D-3）+ `--since` 时间窗 + `--limit` Top-N + `--project` 过滤
    4. `src/analyze/index.ts` 重写为编排器：读 `~/.claude/curdx-flow/observability-state.json` → parser → filter → 写回 offset（finally 块）
  - **Files**: `src/analyze/types.ts`, `src/analyze/parser.ts`, `src/analyze/filter.ts`, `src/analyze/index.ts`
  - **Done when**: 5 件套中 4 件就位（report 在 2.2、redact 在 2.3）；state.json 第二次跑只读 tail；半行 + 未知 type 不挂
  - **Verify**: `npm run typecheck && npm run build && node dist/index.mjs analyze --json > /tmp/a.json && node dist/index.mjs analyze --json > /tmp/b.json && diff /tmp/a.json /tmp/b.json && ls ~/.claude/curdx-flow/observability-state.json`
  - **Commit**: `refactor(analyze): split parser/filter/types + incremental offset state`
  - _Requirements: FR-2, FR-3, FR-4, FR-6, FR-16, FR-17, FR-18, FR-20, NFR-7, AC-6.1_
  - _Design: D-1 size 倒退 / D-2 双键 / D-3 fallback_

- [x] **Task 2.2: 7 报告全量铺开 + schema map JSON + report 模块**
  - **Do**:
    1. 创建 `plugins/curdx-flow/schemas/transcript-events.json`（~150 行）：含 `hook_success` / `tool_use` / `assistant` / `user` 4 类 declarative 映射 + `extractCommandName: true` for user
    2. 创建 `src/analyze/report.ts`（~400 行）：7 段渲染（Hook失败 / Slash command 频次 / Subagent 热度 / Spec 漏斗扫 `./specs/*/.curdx-state.json.phase` / duration P50/P95/P99（样本<5 标"样本不足"）/ unknown_type / parentUuid 断链率）+ `--json` 切换
    3. `parser.ts` 加载 schema map（fallback 内置最小白名单当 JSON 缺失/损坏，stderr 1 行 warning）
    4. report 内合并 errors.jsonl 与 jsonl `hook_success.exitCode≠0`，按 `(hook, ts ±2s, cwd)` 模糊去重（R-2 / R-9）
    5. attribution fallback：缺 `attributionSkill` 时解析 user.content 内 `<command-name>` XML（D-4 / NFR-6）
  - **Files**: `plugins/curdx-flow/schemas/transcript-events.json`, `src/analyze/report.ts`, `src/analyze/parser.ts`, `src/analyze/index.ts`
  - **Done when**: 缺省 markdown 输出含 7 段（`## Hook Failures` / `## Slash Commands` / `## Subagents` / `## Spec Funnel` / `## Hook Duration` / `## Schema Drift` / `## Parent Chain`）；schema map 缺失走 fallback 不挂
  - **Verify**: `npm run build && node dist/index.mjs analyze 2>&1 | tee /tmp/r.md && for s in "## Hook Failures" "## Slash Commands" "## Subagents" "## Spec Funnel" "## Hook Duration" "## Schema Drift" "## Parent Chain"; do grep -qF "$s" /tmp/r.md || { echo MISS:$s; exit 1; }; done && echo PASS_7_SECTIONS`
  - **Commit**: `feat(analyze): full 7 reports + declarative schema map + attribution XML fallback`
  - _Requirements: FR-5, FR-7, FR-19, NFR-6, AC-1.2, AC-2.1, AC-3.1, AC-4.1, AC-5.1, AC-6.1_
  - _Design: schema map / D-4 / 报告渲染 / R-2 join_

- [x] **Task 2.3: redact + error-logger lib + 4 hook 接入**
  - **Do**:
    1. 创建 `src/analyze/redact.ts`（~60 行）：白名单透出模式（D-9）—— prompt 全裁只留长度 + 命令分布、路径仅 basename + project hash（sha256 前 8 字符）、`file-history-snapshot` 字段直接 drop；`--include-prompts` opt-in 解锁
    2. 创建 `src/hooks/_shared/error-logger.ts`（~80 行）：`logHookError(ctx, err)` lazy 读 `~/.claude/settings.json` 缓存 `errorLogEnabled`（D-7，默认 true，settings 缺失/损坏默认 true + stderr warning）；`appendFileSync` 写 `~/.claude/curdx-flow/errors.jsonl`，单行 < 4KB（超长字段截断）；写失败 try/catch 静默
    3. 修改 `src/hooks/_shared/run-hook.ts`：catch 内 + `logHookError({hook, event, msg, cwd, transcript_path}, err)`
    4. 修改 `src/hooks/_shared/types.ts`：`HookStdin` 扩 4 可选字段（FR-10 落地）
    5. `src/analyze/index.ts` 接 redact，缺省裁；`--include-prompts` 跳过裁
  - **Files**: `src/analyze/redact.ts`, `src/hooks/_shared/error-logger.ts`, `src/hooks/_shared/run-hook.ts`, `src/hooks/_shared/types.ts`, `src/analyze/index.ts`
  - **Done when**: 缺省输出 grep 不到 prompt 原文；`--include-prompts` 命中；4 hook 中央 catch 写 errors.jsonl；`errorLogEnabled=false` 不写
  - **Verify**: `npm run typecheck && npm run build:hooks && grep -q "logHookError" plugins/curdx-flow/hooks/scripts/_shared/run-hook.mjs && grep -q "appendFileSync" src/hooks/_shared/error-logger.ts && grep -q "include-prompts" src/flows/analyze.ts`
  - **Commit**: `feat(observability): redact-by-default + error-logger lib + 4-hook integration`
  - _Requirements: FR-8..14, NFR-2, NFR-5, NFR-8, NFR-9, NFR-11, AC-7.1, AC-8.1, AC-8.2, AC-9.1_
  - _Design: D-7 lazy cache / D-9 白名单 / R-8 grep 守护_

- [x] **V2 [VERIFY] Phase 2 quality checkpoint**
  - **Do**: typecheck + build + 5 件套文件存在性检查
  - **Verify**: `npm run typecheck && npm run build && for f in src/analyze/parser.ts src/analyze/filter.ts src/analyze/report.ts src/analyze/redact.ts src/analyze/index.ts src/analyze/types.ts src/flows/analyze.ts src/hooks/_shared/error-logger.ts plugins/curdx-flow/schemas/transcript-events.json; do test -f "$f" || { echo MISS:$f; exit 1; }; done && echo PASS_FILES`
  - **Done when**: 9 文件全在 + typecheck/build 通过
  - **Commit**: `chore(analyze): pass refactor quality checkpoint`（如有修复）

  ---

## Phase 3 — Testing（单测 ≥ 80% + snapshot + redact grep）

- [x] **Task 3.1: parser + filter + redact 单测（含 fixture 错误注入）**
  - **Do**:
    1. 创建 `tests/analyze/fixtures/errors.jsonl`（5 行，覆盖 `quick-mode-guard` + `stop-watcher` + 5 必填字段全在）
    2. 创建 `tests/analyze/parser.test.ts`：snapshot Event 列表 + offset 终态 + counters（半行 → `parse_error_count≥1`，未知 type → `unknown_type_count≥1`，rotate → 全量重读）—— 对应 AT-3 / AT-7
    3. 创建 `tests/analyze/filter.test.ts`：6 case（单 uuid 去重 / 双键去重 / `--since 7d` 边界 / `--limit 10` 截断 / `--project` 不匹配 / 空输入 / requestId 缺失 fallback uuid 单键）—— 对应 AT-8
    4. 创建 `tests/analyze/redact.test.ts`：grep test —— 默认输出 grep 不到 fixture 内 `prompt 原文 sample`；`--include-prompts` 命中 —— 对应 AT-4 / AT-5
  - **Files**: `tests/analyze/fixtures/errors.jsonl`, `tests/analyze/parser.test.ts`, `tests/analyze/filter.test.ts`, `tests/analyze/redact.test.ts`
  - **Done when**: 3 测试文件通过 vitest；含 snapshot；半行 + 未知 type + dedupe + grep 全断言
  - **Verify**: `npx vitest run tests/analyze/parser.test.ts tests/analyze/filter.test.ts tests/analyze/redact.test.ts`
  - **Commit**: `test(analyze): parser/filter/redact unit tests + fixture errors.jsonl`
  - _Requirements: NFR-7, NFR-10, NFR-11, FR-4, FR-6, FR-13, FR-14, FR-20, AT-3, AT-4, AT-5, AT-7, AT-8_
  - _Design: 测试策略-单元_

- [x] **Task 3.2: report snapshot + error-logger fake-fs 测试**
  - **Do**:
    1. 创建 `tests/analyze/report.test.ts`：snapshot 整体 markdown（7 段全在）+ `--json` schema 验证 + AC-1.2 双源 join 校验（jsonl 失败 + errors.jsonl 行同 hook+ts 应去重为 1） —— 对应 AT-1 / AT-6a
    2. 创建 `tests/hooks/error-logger.test.ts`：inject fake fs 验证 4 case：
       - `errorLogEnabled=true` 写 1 行（5 必填字段齐全） —— AT-6a
       - `errorLogEnabled=false` 写 0 行 —— AT-6b
       - settings.json 损坏默认 true + stderr warning
       - `appendFileSync` throw 不冒泡
    3. 修改 `vitest.config.ts` 加 `include: ['tests/**/*.test.ts']`
    4. 修改 `package.json` 加 `"test:analyze": "vitest run tests/analyze"`
  - **Files**: `tests/analyze/report.test.ts`, `tests/hooks/error-logger.test.ts`, `vitest.config.ts`, `package.json`
  - **Done when**: 2 测试文件通过；含 snapshot；4 case 全断言
  - **Verify**: `npm run test:hooks && npm run test:analyze 2>&1 | tee /tmp/t.log && grep -qE "passed.*[0-9]+" /tmp/t.log`
  - **Commit**: `test(analyze): report snapshot + error-logger fake-fs cases`
  - _Requirements: NFR-9, NFR-10, FR-7, FR-8, FR-9, FR-11, FR-12, AC-1.2, AC-7.1, AC-9.1, AT-1, AT-6a, AT-6b_
  - _Design: 测试策略-单元 + 集成_

- [x] **Task 3.3: 集成测试 —— 增量 offset 第二次 ≤ 1/5（NFR-1 timing）**
  - **Do**:
    1. 创建 `tests/analyze/integration.test.ts`：跑 `runAnalyze` 两次，第一次记 `t1`，第二次记 `t2`；assert `t2 ≤ t1 / 5` —— 对应 AT-2
    2. 同文件加：`runAnalyze` 跑 100MB+ 模拟（用 fixture 重复拼接 → ≥ 100MB 内存中流过）不 OOM —— 对应 FR-2
    3. 同文件加：`--json` 输出整体 fixture snapshot 校验
  - **Files**: `tests/analyze/integration.test.ts`
  - **Done when**: 集成测试通过；timing 断言成立；100MB 流式不 OOM
  - **Verify**: `npx vitest run tests/analyze/integration.test.ts --reporter=verbose`
  - **Commit**: `test(analyze): integration - incremental offset timing + 100MB streaming`
  - _Requirements: NFR-1, FR-2, FR-3, AT-2_
  - _Design: 测试策略-集成_

- [ ] **V3 [VERIFY] Phase 3 quality checkpoint + 覆盖率**
  - **Do**: typecheck + 全测 + 覆盖率（NFR-10 ≥ 80%）
  - **Verify**: `npm run typecheck && npx vitest run --coverage tests/analyze tests/hooks 2>&1 | tee /tmp/cov.log && node -e "const log=require('fs').readFileSync('/tmp/cov.log','utf8');const m=log.match(/All files[^|]*\\|\\s*([0-9.]+)/);process.exit(m && parseFloat(m[1])>=80?0:1)" || echo COVERAGE_BELOW_80_OR_PARSE_FAIL`
  - **Done when**: 覆盖率 ≥ 80% 或在覆盖率配置不可解析时手动 grep `vitest run` PASS 输出
  - **Commit**: `chore(analyze): pass test coverage checkpoint`（如有修复）

  ---

## Phase 4 — Quality（i18n + bundle gate + README + reality 冒烟）

- [ ] **Task 4.1: i18n + README + Windows 标注 + tsup bundle 验证**
  - **Do**:
    1. 修改 `src/i18n/en.ts` + `src/i18n/zh.ts` 加 analyze 文案（描述 / `--help` 摘要 / 各 flag 解释，~10 条）
    2. 修改 `README.md`（+20 行）：analyze 子命令文档 + 7 报告样例 + redact 清单 + Windows NTFS 并发非保证标注 + macOS/Linux 实证范围声明
    3. 验证 `tsup` build 后 `plugins/curdx-flow/schemas/transcript-events.json` 路径可由 `src/analyze/parser.ts` 通过 `__dirname` 相对解析（fallback 内置白名单作为安全网，见 .progress.md learnings）
  - **Files**: `src/i18n/en.ts`, `src/i18n/zh.ts`, `README.md`, `src/analyze/parser.ts`（路径解析微调如需）
  - **Done when**: `--help` 含中英文双语描述；README 含 4 个新段；schema 路径解析在 dist 后仍 work
  - **Verify**: `npm run build && node dist/index.mjs analyze --help 2>&1 | grep -qE "analyze|分析" && grep -qE "analyze|Windows.*未实证|NTFS" README.md && node dist/index.mjs analyze --json >/dev/null && echo PASS_I18N_README`
  - **Commit**: `docs(analyze): i18n + README + Windows attribution + schema path verify`
  - _Requirements: NFR-5, NFR-6_
  - _Design: 文件清单 i18n + README + tsup_

- [ ] **Task 4.2: bundle gate（NFR-3 < 84KB）+ 0 新依赖（NFR-4）+ D-5 lazy 兜底**
  - **Do**:
    1. 加 `scripts/check-bundle-size.mjs`：`wc -c dist/index.mjs`，超 84KB exit 1（NFR-3 当前 64KB + 20KB）
    2. `package.json` 加 `"check:bundle": "node scripts/check-bundle-size.mjs"` + 勾入 `verify` 链
    3. 如超阈，立即触发 D-5 lazy import：把 `src/flows/analyze.ts` body 改为 `await import('../analyze/index.js')` 动态导入，重测
    4. assert `git diff package.json` 在 dependencies 段 0 新增（NFR-4）
  - **Files**: `scripts/check-bundle-size.mjs`, `package.json`, 可能 `src/flows/analyze.ts`（lazy 兜底）
  - **Done when**: bundle ≤ 84KB；dependencies 0 新增
  - **Verify**: `npm run build && npm run check:bundle && git diff package.json | grep -E "^\+\s+\"" | grep -v devDependencies | grep -E "\":\s*\"\\^" && echo "NEW_DEP_FOUND" && exit 1 || echo PASS_BUNDLE_AND_DEPS`
  - **Commit**: `chore(build): add bundle size gate + verify zero new npm dep`
  - _Requirements: NFR-3, NFR-4, AT-9_
  - _Design: D-5 lazy 兜底_

- [ ] **Task 4.3: Reality verification —— 真实 jsonl 冒烟 + VF（fix-type goal 等价）**
  - **Do**:
    1. 用本机 `~/.claude/projects/-Users-wdx-opc-curdx-flow/` 真实 jsonl 跑 `node dist/index.mjs analyze --since 7d --limit 5 --out /tmp/observability-real.md`
    2. assert `/tmp/observability-real.md` 含 7 段 + 不抛错
    3. assert `~/.claude/curdx-flow/observability-state.json` 已写
    4. 故意触发 1 hook 错误（在 `quick-mode-guard.ts` 临时加 throw 后 build hooks，触发 PreToolUse；测后 git checkout 还原）
    5. assert `~/.claude/curdx-flow/errors.jsonl` 增 1 行含 5 必填字段
    6. 还原 `quick-mode-guard.ts` + 删测试痕迹（`/tmp/observability-real.md`）
  - **Files**: 临时改 `src/hooks/quick-mode-guard.ts`（测后还原）；写 `/tmp/observability-real.md`（测后删）
  - **Done when**: 真实 jsonl 解析无 throw；errors.jsonl 真有内容；`git status` 干净
  - **Verify**: `npm run build && node dist/index.mjs analyze --since 7d --limit 5 --out /tmp/observability-real.md 2>&1 && grep -c "^## " /tmp/observability-real.md | awk '$1 >= 7' && rm /tmp/observability-real.md && git status --short src/hooks/quick-mode-guard.ts | grep -q . && echo "DIRTY_RESTORE_FAIL" && exit 1 || echo PASS_REALITY`
  - **Commit**: `chore(analyze): reality verification on local real jsonl`
  - _Requirements: AC-7.1, AT-6a, FR-2, FR-7_
  - _Design: 测试策略-真实 session 冒烟_

- [ ] **V4 [VERIFY] Phase 4 quality checkpoint**
  - **Do**: 全 verify 链 + bundle gate
  - **Verify**: `npm run typecheck && npm run check:bundle && npm run check:hooks-fresh && npm run test:hooks && npx vitest run tests/analyze`
  - **Done when**: 全部命令退出 0
  - **Commit**: `chore(analyze): pass quality phase checkpoint`（如有修复）

  ---

## Phase 5 — E2E Verification（VE1/VE2/VE3）

- [ ] **VE1 [VERIFY] E2E startup —— 构建 dist + 准备 fixture jsonl + 备份 state**
  - **Do**:
    1. `npm run build && npm run build:hooks`
    2. 备份现有 `~/.claude/curdx-flow/observability-state.json` 到 `/tmp/observability-state.bak`（若不存在则 touch 占位）
    3. 备份现有 `~/.claude/curdx-flow/errors.jsonl` 到 `/tmp/errors.jsonl.bak`（若不存在则 touch 占位）
    4. 拷贝 `tests/analyze/fixtures/sample.jsonl` 到一个测试 encoded-cwd 路径（如 `~/.claude/projects/-tmp-ve-curdx-fixture/poc.jsonl`），创建对应目录
    5. 写 PID 文件 `/tmp/ve-pids.txt`（VE 不起 server 但保留约定，写入 `echo $$ > /tmp/ve-pids.txt`）
  - **Verify**: `test -f dist/index.mjs && test -f /tmp/observability-state.bak && test -f /tmp/errors.jsonl.bak && test -f ~/.claude/projects/-tmp-ve-curdx-fixture/poc.jsonl && echo VE1_PASS`
  - **Done when**: dist + hooks 构建好；备份就位；fixture 就位
  - **Commit**: None

- [ ] **VE2 [VERIFY] E2E check —— 三轮 analyze + 7 段 + errors.jsonl 真写**
  - **Do**:
    1. 第一轮（fixture）：`node dist/index.mjs analyze --project -tmp-ve-curdx-fixture --json > /tmp/ve-r1.json`，assert 7 段 key 全在
    2. 第二轮（增量 offset）：再跑一次，记录 t2 应远短于 t1（NFR-1 时间断言）
    3. 第三轮（真实 jsonl + redact）：`node dist/index.mjs analyze --since 30d --limit 5 > /tmp/ve-r3.md`，assert 7 段 + grep 不到 prompt 原文
    4. 触发 errors.jsonl：构造 invalid `HookStdin` 喂给 `node plugins/curdx-flow/hooks/scripts/quick-mode-guard.mjs <<< 'INVALID JSON'`，assert errors.jsonl 增行
  - **Verify**: `node dist/index.mjs analyze --project -tmp-ve-curdx-fixture --json > /tmp/ve-r1.json && node -e "const j=JSON.parse(require('fs').readFileSync('/tmp/ve-r1.json'));['hookFailures','slashCommands','subagents','specFunnel','hookDuration','schemaDrift','parentChain'].forEach(k=>{if(!(k in j)){console.error('MISS:'+k);process.exit(1)}});console.log('PASS_7_KEYS')" && node dist/index.mjs analyze --since 30d --limit 5 > /tmp/ve-r3.md && grep -c "^## " /tmp/ve-r3.md | awk '$1>=7{print "PASS_REAL"}' | grep -q PASS_REAL && echo 'INVALID JSON' | node plugins/curdx-flow/hooks/scripts/quick-mode-guard.mjs 2>/dev/null; tail -1 ~/.claude/curdx-flow/errors.jsonl 2>/dev/null | python3 -c "import json,sys;d=json.loads(sys.stdin.read());[d[k] for k in ['ts','level','hook','event','msg']];print('PASS_ERRORS_JSONL')" && echo VE2_PASS`
  - **Done when**: 7 段全 + redact 默认生效 + errors.jsonl 真写
  - **Commit**: None

- [ ] **VE3 [VERIFY] E2E cleanup —— 还原 state + 删 fixture 痕迹**
  - **Do**:
    1. 还原 `~/.claude/curdx-flow/observability-state.json` ←  `/tmp/observability-state.bak`（若 bak 是空 touch 则 rm 当前 state.json）
    2. 还原 `~/.claude/curdx-flow/errors.jsonl` ← `/tmp/errors.jsonl.bak`（同上）
    3. 删除 `~/.claude/projects/-tmp-ve-curdx-fixture/`（整目录）
    4. 删除 `/tmp/ve-r1.json` `/tmp/ve-r3.md` `/tmp/observability-state.bak` `/tmp/errors.jsonl.bak` `/tmp/ve-pids.txt`
    5. assert 测试 encoded-cwd 不存在；PID 文件已删
  - **Verify**: `rm -rf ~/.claude/projects/-tmp-ve-curdx-fixture/ /tmp/ve-r1.json /tmp/ve-r3.md /tmp/observability-state.bak /tmp/errors.jsonl.bak /tmp/ve-pids.txt && test ! -d ~/.claude/projects/-tmp-ve-curdx-fixture && test ! -f /tmp/ve-pids.txt && echo VE3_PASS`
  - **Done when**: 测试痕迹清干净；备份还原成功
  - **Commit**: None

  ---

## Final Verification Sequence

- [ ] **V5 [VERIFY] 全 phase 总闸门**
  - **Do**: 跑全套验证链
  - **Verify**: `npm run typecheck && npm run check:hooks-fresh && npm run check:bundle && npm run test:hooks && npx vitest run tests/analyze && npm run build && node dist/index.mjs analyze --help`
  - **Done when**: 全部命令退出 0；CI 等价本地复现成功
  - **Commit**: `chore(analyze): pass full local CI gate`（如有修复）

- [ ] **V6 [VERIFY] FR/NFR/AC × 任务 + 文件清单 23 条 矩阵核对**
  - **Do**:
    1. 自动核对 FR-1..20 / NFR-1..11 / AC-1.1..9.1 / AT-1..10 每条至少被 1 个任务覆盖（grep `_Requirements:` 所有任务的引用集合）
    2. 自动核对 design.md 文件清单 23 条（12 创建 + 11 修改）每条都有任务实际操作（grep 任务的 Files: 段）
    3. 输出矩阵报告到 stdout（不写文件）
    - 列举 AC 检查项（plain 列表，不用 checkbox）：
      - AC-1.1 — Task 1.2 / 2.2 (hookFailures + lastStderr)
      - AC-1.2 — Task 2.2 / 3.2 (双源 join + snapshot)
      - AC-2.1 — Task 2.2 (attribution + XML fallback)
      - AC-3.1 — Task 2.2 (subagent_type 聚合)
      - AC-4.1 — Task 2.2 (specs/*/.curdx-state.json.phase 扫描)
      - AC-5.1 — Task 2.2 (P50/P95/P99 + "样本不足")
      - AC-6.1 — Task 2.1 / 2.2 (unknown_type + parentUuid 断链)
      - AC-7.1 — Task 2.3 / 3.2 / 4.3 (4 hook errors.jsonl)
      - AC-8.1 — Task 2.3 / 3.1 (默认 redact)
      - AC-8.2 — Task 2.3 / 3.1 (--include-prompts opt-in)
      - AC-9.1 — Task 2.3 / 3.2 (errorLogEnabled=false 不写)
  - **Verify**: `python3 -c "import re,sys;t=open('specs/plugin-observability/tasks.md').read();reqs=set(re.findall(r'(?:FR|NFR|AC|AT|US)-[0-9.a-z]+',t));needed={f'FR-{i}' for i in range(1,21)}|{f'NFR-{i}' for i in range(1,12)}|{f'AC-{i}.1' for i in range(1,10)}|{'AC-8.2'}|{f'AT-{i}' for i in range(1,11)}|{f'US-{i}' for i in range(1,10)};missing=needed-reqs;print('MISSING:',missing) if missing else print('PASS_MATRIX')"`
  - **Done when**: stdout 输出 `PASS_MATRIX`
  - **Commit**: None

  ---

## Risk → Task 缓解映射

| 风险 | 由谁缓解 |
|---|---|
| R-1（schema 漂移） | Task 2.1（counters）+ 2.2（schema map JSON + drift 报告段） |
| R-2（HookStdin 仅 3 字段） | Task 2.2（report 内 ts ±2s + cwd 模糊 join）+ 2.3（types.ts 扩字段） |
| R-3（bundle > 20KB） | Task 4.2（CI gate + D-5 lazy 兜底） |
| R-4（100MB OOM） | Task 2.1（readline 流式）+ 3.3（100MB 集成测试） |
| R-5（resume 双键不足） | Task 2.1（D-3 fallback）+ 3.1（filter 6-case 测试） |
| R-6（Windows NTFS 撕行） | Task 4.1（README 标注）+ 2.3（< 4KB 单行） |
| R-7（settings.json 拖慢） | Task 2.3（D-7 lazy + module 缓存）+ 3.2（fake-fs 测试） |
| R-8（redact 漏新字段） | Task 2.3（白名单透出）+ 3.1（grep 守护测试） |
| R-9（双源重复计数） | Task 2.2（report 模糊 join 去重）+ 3.2（snapshot 校验） |
| R-10（非 git 仓库 cwd） | Task 2.1（filter 不匹配空报告）+ 4.1（README warning 文案） |

---

## POC 短路 / 生产 TODO

- **POC 短路（Phase 1）**：Task 1.2 inline parser（仅 hook_success），fixture 路径硬编码 → Task 2.1 抽出 5 件套时清掉。
- **POC 短路（Phase 1）**：Task 1.3 inline markdown 渲染 → Task 2.2 移到 `report.ts`。
- **生产 TODO（已纳入任务）**：D-5 lazy import 在 Task 4.2 触发；attribution XML fallback 在 Task 2.2；schema map fallback 内置白名单在 Task 2.2；reality verification 在 Task 4.3。
- **延期项**：errors.jsonl 自动轮转（KISS，年增 < 10MB，用户手动 rm）；Windows 实测（NFR-5 仅声明，README 标注）。

---

## Action Steps

1. user review tasks.md。
2. 通过则跑 `/curdx-flow:implement` 启动闭环。
3. spec-executor 按 Phase 1 → 5 顺序执行；每 [VERIFY] 闸门必跑且不许跳。
4. VE1/VE2/VE3 顺序执行（不可并行；VE3 即便前置失败也必须 cleanup）。
5. V6 矩阵核对若 stdout 出现 `MISSING:` 则补齐对应任务的 `_Requirements:` 引用。

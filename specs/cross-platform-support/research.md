# Research: cross-platform-support

## Executive Summary

把 curdx-flow 插件从 bash+jq 移植到 Node `.mjs`，覆盖 Windows + macOS + Linux 三平台是**可行的**，但**之前 session 的"用 .mjs 就行"是个简化结论**——Anthropic 自己的 canonical 模式仍是 bash+jq，9 个调研的真实插件里 0 个用 `node script.mjs`。最稳的姿势是：hooks.json 显式声明 `"shell": "bash"`、command 形如 `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/X.mjs"`、SessionStart 加 `"async": true`、源在 `src/hooks/*.ts` 用 raw esbuild bundle 成单文件 `.mjs` 并 commit 进仓库、`.gitattributes` 钉死 LF、`hooks/scripts/package.json` 写 `{"type":"module"}`、CI 必须加 `windows-latest` 跑 smoke test。**Effort: L | Risk: M | Feasibility: H**。

---

## External Research

### Best Practices

**Hook 执行模型**（来自 Anthropic 官方 docs/code）
- `command` 字段交给 shell 执行（`bash -c` 或 `powershell -Command`），不是 token-split 直 exec
- `shell` 字段（"bash" 默认 / "powershell"）决定解释器
- Windows 默认 bash 等于 Git Bash（MSYS2/MINGW64）
- 支持的环境变量：`$CLAUDE_PROJECT_DIR`、`${CLAUDE_PLUGIN_ROOT}`、`${CLAUDE_PLUGIN_DATA}`，shell 之前展开

**esbuild 单文件 Node CLI 推荐配置**
| 选项 | 值 | 原因 |
|------|----|----|
| `platform` | `'node'` | 标记 `node:*` 为 external |
| `target` | `'node20'` | 项目 engines.node 已是 >=20.12.0，可直接用 `import.meta.dirname` |
| `format` | `'esm'` | 现代、top-level await |
| `bundle` | `true` | 单文件自包含，运行时无 node_modules |
| `packages` | `'bundle'` | npm deps 内联（默认值，显式更稳） |
| `outExtension` | `.mjs` | 强制 ESM 解释，不依赖最近 package.json |
| `banner.js` | `__dirname` shim | Node 20.11+ 有 `import.meta.dirname` 但 banner 更兼容 |
| `treeShaking` | `true` | 削减无用代码 |
| `sourcemap` | `'linked'` | 调试支持 |

**Stdin JSON 读取**：必须 async iterator，**不能** `readFileSync(0)`：
- nodejs/node#19831：Windows fd 0 throws when stdin closed/empty
- nodejs/node-v0.x-archive#7412：`readFileSync('/dev/stdin')` 在重定向文件时 cap 在 64KB

```js
async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}
```

### Prior Art (Plugin Survey)

| Plugin | Strategy | hooks.json command 样例 |
|--------|----------|-------------------------|
| anthropics/.../hookify | python3 + .py | `python3 ${CLAUDE_PLUGIN_ROOT}/hooks/pretooluse.py` |
| anthropics/.../security-guidance | python3 | `python3 ${CLAUDE_PLUGIN_ROOT}/hooks/security_reminder_hook.py` |
| anthropics/.../ralph-loop | bash + .sh | `bash "${CLAUDE_PLUGIN_ROOT}/hooks/stop-hook.sh"` |
| anthropics/.../explanatory-output-style | bash + .sh | 同上 |
| anthropics SKILL.md (canonical) | bash + .sh + jq | `bash ${CLAUDE_PLUGIN_ROOT}/scripts/validate.sh` |
| **thedotmack/claude-mem** | **node + .cjs**（不是 .mjs！）+ 重 bash shim | 见下方 |
| axiomhq/cli | 直接 .sh（shebang+exec bit） | `${CLAUDE_PLUGIN_ROOT}/hooks/nudge-skill.sh` |
| ppgranger/token-saver | python3 | `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/hook_pretool.py"` |
| linxule/memex-plugin | 直接 .py（shebang） | `${CLAUDE_PLUGIN_ROOT}/hooks/session-start.py` |

**关键观察**：0/9 用 `node script.mjs`，唯一最近的 claude-mem 用 `.cjs` 而非 `.mjs`，并且包了一层 ~30 行 bash shim 处理 PATH 引导、CLAUDE_PLUGIN_ROOT 兜底、cygpath 翻译。

### Pitfalls to Avoid (Real Windows Bugs)

| # | Bug | 原因 | Mitigation |
|---|-----|------|-----------|
| 1 | **CRLF 毒化 shebang** | `core.autocrlf=true` → bash 找不到 `bash\r` | `.gitattributes` 钉 `*.sh *.mjs *.cjs *.js text eol=lf` |
| 2 | **同步 hook Windows 死锁** ([#34457](https://github.com/anthropics/claude-code/issues/34457), [#351](https://github.com/anthropics/claude-plugins-official/issues/351)) | event loop 在 init 期未启动，子进程完成信号收不到 | SessionStart 加 `"async": true` |
| 3 | **CLAUDE_PLUGIN_ROOT 在 SessionStart 未注入** ([#27145](https://github.com/anthropics/claude-code/issues/27145)) | 旧版 Claude Code 此 hook 时 var 是空字符串 → MODULE_NOT_FOUND | 写 4 行 bash 兜底 OR 测试最低支持的 Claude Code 版本 |
| 4 | **`.mjs` 走错 loader 报 MODULE_NOT_FOUND** ([oh-my-claudecode#267](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/267)) | Windows 上 `.mjs` 被 CJS loader 加载（疑似 nvm-for-Windows + npm.cmd shim 交互） | 在 hooks/scripts/ 同目录放 `package.json {"type":"module"}` 强制 ESM；如仍 fail 则 fallback 到 .cjs |
| 5 | **Git-Bash vs WSL 歧义** | bare `bash` 可能解析到 WSL bash → execvpe 失败 | 让用户依赖 PATH，或如 ralph-loop 硬编 `"C:/Program Files/Git/bin/bash.exe"` |
| 6 | **PowerShell 变量展开破坏** | bash 先展开 `$_`、backslash → PowerShell 收到错乱命令 | 不要设 `"shell": "powershell"` |
| 7 | **exec bit 在 Windows checkout 被剥** | git on Windows 不保留 mode 位 | 一律显式 `node script.mjs`、`bash script.sh`，不要靠 shebang+chmod |

---

## Codebase Analysis

### Existing Patterns

**Hook 入口（plugins/curdx-flow/hooks/hooks.json）**
- 3 个 hook 注册：SessionStart / PreToolUse:AskUserQuestion / Stop
- 全部 `"command": "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<name>.sh"`（无 `bash` 前缀，依赖 shebang+exec bit——已经是 Windows 风险点）
- 无 `shell`、`async` 字段

**7 个 .sh 脚本（hooks/scripts/）**

| Script | Trigger | Stdin | LOC | 外部工具 |
|--------|---------|-------|-----|----------|
| load-spec-context.sh | SessionStart | JSON {cwd} | 110 | jq, sed, awk, grep, basename |
| path-resolver.sh | sourced lib | none | 252 | grep, sed, tr, find, basename |
| quick-mode-guard.sh | PreToolUse:AskUserQuestion | JSON {cwd} | 47 | jq, pwd, cd |
| stop-watcher.sh | Stop | JSON {cwd, transcript_path, stop_hook_active} | 362 | jq, sed, awk, grep, tail, date, stat (OS-specific!), find, mktemp |
| update-spec-index.sh | manual | none | 275 | jq, find, sed, tr, grep, wc, date |
| test-path-resolver.sh | manual | none | 581 | mktemp, grep, wc, tr |
| test-multi-dir-integration.sh | manual | none | 743 | mktemp, grep, wc, tr |

**Markdown 嵌入命令（30+ 文件 79 处）**
- 22 jq、24 grep、3 find、2 lsof、2 xargs、3 cat、1 sed、1 mkdir
- 分类：12 jq EXEC（必须 Claude 跑）、8 jq EXAMPLE（说明用）、2 jq CODE_BLOCK_REFERENCE
- 替代策略：14 node-oneliner / 45 extract-to-lib / 20 inline-prose
- Hot files：templates/tasks.md (13)、agents/task-planner.md (11)、commands/implement.md (6)

### Dependencies

**生产依赖（package.json）**
- @clack/prompts ^1.2.0
- citty ^0.1.6
- picocolors ^1.1.0
- tinyexec ^1.0.0

全部跨平台。

**Dev deps**
- @types/node ^22.10.0
- tsup ^8.3.0
- typescript ^5.6.0

**没有**：eslint / prettier / vitest / jest / bats / shellcheck。

**engines.node**: `>=20.12.0` — 说明可以直接 `target: 'node20'`，**比 R-2 推荐的 node18 更激进可行**。

### Constraints

- **Plugin 通过 git 分发**：用户机器无 install/build 步，bundled 产物必须 commit
- **5-field version gate**：bump-version.mjs / check-versions.mjs 已有，hooks bundling 不引入新 version 字段
- **prepublishOnly**：`check-versions && typecheck && build`——hooks build 必须挂在这里
- **CI 当前**：ubuntu-latest only，Node 20+22，无任何测试 runner
- **CI 当前**：release.yml 单 ubuntu，无 Windows 验证
- **零 schema validator**：hooks.json / plugin.json / spec.schema.json 都不被自动校验

### Migration Risks (15 项，stop-watcher 最重)

1. Shell parameter expansion（path normalization 用 `${var%%pattern}`）
2. Heredoc with var substitution（`<<EOF`、`<<'EOF'`）
3. Process substitution `<(...)` / `<<<` heredoc
4. 复杂 sed（YAML frontmatter 提取、trim 末尾空行的 `:a` label）
5. 复杂 awk 状态机（按 task index 提取 markdown 任务块）
6. Word-boundary grep（`grep -qE '(^|\W)ALL_TASKS_COMPLETE(\W|$)'`）
7. **OS-specific stat**：macOS `stat -f %m` vs Linux `stat -c %Y`
8. mktemp 原子写入（`stop-watcher.sh` 用于 epic state 更新）
9. Bash 数组 + IFS 操作
10. `source` 共享库语义（path-resolver.sh 被 4 个脚本 source）
11. `set -euo pipefail`
12. basename 路径操作
13. find 跨平台 flag 差异（GNU vs BSD）+ `-exec`
14. Exit code 当返回值（curdx_find_spec 返回 0/1/2）
15. ANSI 颜色码（test 脚本用）

---

## Related Specs

| Spec | Relevance | Relationship | May Need Update |
|------|-----------|--------------|-----------------|
| superpowers-inline-review | Low | 已存在但是空目录无 .progress.md | No |

无相关历史 spec。新地。

---

## Quality Commands

| Type | Command | Source |
|------|---------|--------|
| typecheck | `npm run typecheck` (= `tsc --noEmit`) | package.json |
| build CLI | `npm run build` (= `tsup`) | package.json |
| version gate | `npm run check-versions` | package.json + scripts/check-versions.mjs |
| version bump | `npm run bump-version <patch\|minor\|major\|X.Y.Z>` | package.json + scripts/bump-version.mjs |
| CLI dev watch | `npm run dev` (= `tsup --watch`) | package.json |
| **MISSING** | `npm run build:hooks` (esbuild driver) | 待新增 |
| **MISSING** | `npm run check:hooks-fresh` (build + git diff --exit-code) | 待新增 |
| **MISSING** | `npm run test:hooks` (smoke test runner) | 待新增 |
| **MISSING** | `npm run verify` (聚合命令) | 待新增 |

---

## Feasibility Assessment

| 维度 | 评估 | 说明 |
|------|------|------|
| 技术可行性 | **High** | esbuild + Node 20 ESM 已成熟；Anthropic hooks 文档完整；已有 claude-mem 等 .cjs/.py 跨平台插件做参考 |
| Anthropic 支持 | Medium | Anthropic 官方推荐还是 bash+jq；node 路线属于自选，但有 `shell` 字段官方支持 |
| Windows 真实风险 | **Medium** | Issue #267（.mjs MODULE_NOT_FOUND）根因未确认；CRLF / sync hang / CLAUDE_PLUGIN_ROOT 都有已知 mitigation |
| 工作量 | **L** | ~3000 LOC bash → TypeScript 1:1 移植；79 处 markdown 替换；新增 build:hooks pipeline；CI 矩阵；smoke test |
| 时间预估 | 1-2 周（聚焦工作） | stop-watcher.sh (362 LOC + awk 状态机) 是最大单点 |
| 回滚成本 | Low | major bump v7.0.0 + 旧 v6.x 仍可访问；用户 downgrade 一行命令 |

---

## Recommendations for Requirements

### MUST 必做

1. **target node20**（不是 node18，与 engines.node 一致）
2. **hooks.json 重写**：
   - `"command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<name>.mjs\""`
   - `"shell": "bash"` 显式
   - SessionStart 加 `"async": true`
3. **源代码新结构**：`src/hooks/<name>.ts`（含 `_shared/` 内部工具）
4. **Bundle 输出新位置**：`plugins/curdx-flow/hooks/scripts/<name>.mjs`，commit 进 git
5. **新增 `hooks/scripts/package.json`**：`{"type": "module"}` 强制 ESM 解释（mitigation for #267）
6. **新增 `.gitattributes`**：`*.sh *.mjs *.cjs *.js text eol=lf`
7. **5 个 .sh 全部移植**（保留 2 个 test 脚本暂不移植，作为参考用例直到测试套件建立）
8. **79 处 markdown 命令替换**：14 node-oneliner / 45 extract-to-lib（落到 `hooks/scripts/lib/`）/ 20 inline-prose
9. **新增 build pipeline**：`scripts/build-hooks.mjs` (esbuild driver)
10. **package.json 加 4 个 script**：`build:hooks`、`build`（聚合 CLI + hooks）、`check:hooks-fresh`、`test:hooks`
11. **prepublishOnly 加 build:hooks**
12. **ci.yml 加 OS 矩阵**：`os: [ubuntu-latest, macos-latest, windows-latest]`
13. **新增 smoke test**：每个 hook 喂固定 stdin JSON、断言 stdout/exit code（test runner 选 vitest，TS 友好且 dev dep 已经在 Node ecosystem）
14. **CI 加 check:hooks-fresh**：源改了忘 rebuild → CI red
15. **major bump v7.0.0**，CHANGELOG 列 BREAKING CHANGE

### SHOULD 应做

16. JSON Schema 校验 hooks.json / plugin.json / spec.schema.json（ajv），加进 `npm run verify`
17. 写入 v6 → v7 迁移指南（用户读完知道为什么 break、如何升级）
18. Stdin 读取统一通过 `_shared/stdin.ts` 的 async iterator（防止单点 readFileSync 误用）

### MAY 可做

19. macOS native CI（用户都是 mac，理论上低概率）→ 排在 windows-latest 之后即可
20. shellcheck 给保留的 .sh 测试脚本做 lint
21. 给 hooks/scripts/ 加 husky pre-commit 钩子，src/hooks 改了自动 build:hooks

---

## Open Questions

1. **Issue #267 的实际触发条件未定**：colocated `package.json {"type":"module"}` 能否完全规避？需要 Windows runner 上验证。如果还 fail，是否回退到 `.cjs`（牺牲 top-level await）？
2. **保留旧 .sh 还是直接删？** 当前推荐方案是「全删」+ major bump，但是否要在 v7.0.0 第一版保留旧 .sh 作为 disabled fallback（额外 hooks.json 不引用）以便用户对照？
3. **hooks.json 要不要硬编 `"C:/Program Files/Git/bin/bash.exe"` 兜底？** ralph-loop 这么做。简洁性 vs 兜底鲁棒性。
4. **bats 还是 vitest 做 smoke test？** vitest 与 TS toolchain 一致；bats 更接近真实 hook 运行环境（直接 spawn `node script.mjs` 喂 stdin）。倾向 vitest（一个 toolchain），但需要在 design 里再 confirm。
5. **stop-watcher.sh 的 awk 任务提取状态机是否需要改成 markdown AST 解析（remark-parse）**？正则会更脆，AST 更稳但加 dep。

---

## Sources

### Primary (Anthropic-authored)
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/setup
- https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md
- https://github.com/anthropics/claude-plugins-official/blob/main/plugins/hookify/hooks/hooks.json
- https://github.com/anthropics/claude-plugins-official/blob/main/plugins/security-guidance/hooks/hooks.json
- https://github.com/anthropics/claude-plugins-official/blob/main/plugins/ralph-loop/hooks/hooks.json
- https://github.com/anthropics/claude-plugins-official/blob/main/plugins/explanatory-output-style/hooks/hooks.json

### Bug evidence
- https://github.com/anthropics/claude-code/issues/34457 — Windows 5min hang
- https://github.com/anthropics/claude-code/issues/27145 — CLAUDE_PLUGIN_ROOT unset on SessionStart
- https://github.com/anthropics/claude-code/issues/27768 — misleading ENOENT
- https://github.com/anthropics/claude-code/issues/21162 — spawn /bin/sh ENOENT
- https://github.com/anthropics/claude-plugins-official/issues/351 — async:true fix
- https://github.com/Yeachan-Heo/oh-my-claudecode/issues/267 — .mjs MODULE_NOT_FOUND on Windows
- https://github.com/thedotmack/claude-mem/issues/629 — CLAUDE_PLUGIN_ROOT not expanded
- https://github.com/nodejs/node/issues/19831 — Windows fd 0 stdin exception
- https://github.com/nodejs/node-v0.x-archive/issues/7412 — readFileSync stdin 64KB cap

### Tooling docs
- https://esbuild.github.io/api/
- https://github.com/egoist/tsup
- https://github.com/egoist/tsup/issues/684 — shebang+esbuild plugin
- https://github.com/evanw/esbuild/issues/1492 — import.meta.url ESM→CJS
- https://www.sonarsource.com/blog/dirname-node-js-es-modules
- https://blog.logrocket.com/alternatives-dirname-node-js-es-modules/
- https://www.totaltypescript.com/build-a-node-app-with-typescript-and-esbuild

### Real-world plugin examples
- https://github.com/thedotmack/claude-mem/blob/main/plugin/hooks/hooks.json — heavy Windows shim
- https://github.com/anthropics/claude-code/tree/main/plugins — official examples

### Secondary (opinion / community)
- https://claudefa.st/blog/tools/hooks/cross-platform-hooks (单源，需谨慎引用)
- https://blog.netnerds.net/2026/02/claude-code-powershell-hooks/
- https://code.visualstudio.com/docs/copilot/customization/hooks (类比 VSCode hook)
- https://www.pkgpulse.com/blog/tsup-vs-rollup-vs-esbuild-2026

### Codebase audit (in this repo)
- `.research-shell-scripts-catalog.md` (806 行 1:1 .sh catalog)
- `.research-markdown-jq-catalog.md` (710 行 79 处 markdown 命令)
- `.research-ci-build-infrastructure.md` (511 行 CI/build 现状)
- `.research-quality-commands.md` (288 行 质量命令)
- `.research-hook-execution.md` (305 行 hook 语义)
- `.research-esbuild-patterns.md` (445 行 esbuild 模式)

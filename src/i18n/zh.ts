const messages = {
  'app.intro': '@curdx/flow — Claude Code 插件 / MCP 一键安装',
  'app.outro': '完成。',
  'app.cancelled': '已取消。',

  'lang.prompt': '请选择界面语言 / Please choose your language',
  'lang.zh': '中文',
  'lang.en': 'English',

  'menu.title': '想做什么？',
  'menu.install': '安装 / 重装插件和 MCP',
  'menu.update': '更新已安装的插件',
  'menu.uninstall': '卸载已安装的插件和 MCP',
  'menu.status': '查看当前安装状态',
  'menu.exit': '退出',

  'pkg.installed': '已安装',
  'pkg.notInstalled': '未安装',
  'pkg.unknown': '未知',
  'pkg.upToDateWithVersion': '已安装 v{version}',
  'pkg.updateAvailable': '已安装 v{current} → v{latest} 可用',

  'marketplace.refreshing': '刷新 marketplace 缓存…',
  'marketplace.refreshed': '已刷新 {count} 个 marketplace',
  'marketplace.refreshSkipped': 'marketplace 缓存仍是新鲜的，跳过刷新',

  'install.updating': '更新 "{name}" 到 v{version}',

  'install.requiredHeader': '以下条目随 @curdx/flow 默认安装（不可取消）',
  'install.selectPrompt': '勾选要安装 / 重装的条目（默认勾选未安装的）',
  'install.nothingSelected': '没有选择任何条目，已退出。',
  'install.confirmReinstall': '"{name}" 已安装，是否重新安装（先卸载再安装）？',
  'install.skippedReinstall': '已跳过 "{name}"（已安装）。',
  'install.prereqFail': '"{name}" 前置检查未通过：{reason}',
  'install.starting': '开始安装 "{name}"',
  'install.success': '"{name}" 安装成功',
  'install.failed': '"{name}" 安装失败',
  'install.summaryTitle': '安装结果',
  'install.summaryOk': '成功 {count}',
  'install.summaryFail': '失败 {count}',
  'install.summarySkip': '跳过 {count}',

  'uninstall.selectPrompt': '勾选要卸载的条目（仅显示当前已安装的）',
  'uninstall.noneInstalled': '当前没有由本工具管理的条目处于已安装状态。',
  'uninstall.confirm': '将卸载 {count} 项，确定吗？',
  'uninstall.starting': '开始卸载 "{name}"',
  'uninstall.success': '"{name}" 卸载成功',
  'uninstall.failed': '"{name}" 卸载失败',

  'update.selectPrompt': '勾选要更新的条目',
  'update.noneInstalled': '当前没有可更新的已安装条目。',
  'update.starting': '开始更新 "{name}"',
  'update.success': '"{name}" 更新成功',
  'update.failed': '"{name}" 更新失败',

  'status.title': '当前状态',
  'status.headerName': '名称',
  'status.headerType': '类型',
  'status.headerState': '状态',


  'chrome.prereqNode': '需要 Node.js >= 20.19，当前版本 {current}',
  'chrome.prereqChrome': '需要本机已安装 Chrome（chrome-devtools-mcp 会调用本地浏览器）',

  'bun.missing': '未检测到 Bun，claude-mem 的后台 worker 依赖 Bun 运行。',
  'bun.installerSource': 'Bun 安装脚本来源：https://bun.sh（macOS/Linux 用 curl，Windows 用 powershell irm）。',
  'bun.confirmInstall': '是否现在自动安装 Bun？（默认否——选否将跳过 claude-mem，其他插件继续安装）',
  'bun.declined': '已跳过 Bun 安装；claude-mem 需要 Bun，本次不安装。手动装好 Bun 后可重跑 install。',
  'bun.installing': '正在下载并安装 Bun（首次约 60MB）…',
  'bun.installed': 'Bun 安装完成。',
  'bun.installFailedTitle': 'Bun 安装失败',
  'bun.installFailedReason': 'Bun 安装失败：{error}',
  'bun.installedButNotFound': 'Bun 安装脚本声明成功，但未在已知路径找到 bun 可执行文件——请手动确认后重跑。',

  'reinstall.uninstalling': '先卸载旧版本…',
  'reinstall.installing': '安装新版本…',

  'state.checking': '检查已安装状态…（claude plugin list / mcp list）',
  'state.checked': '已检查 {count} 项',

  'claudeMd.syncing': '同步 ~/.claude/CLAUDE.md …',
  'claudeMd.synced': 'CLAUDE.md 已更新（{path}）',
  'claudeMd.unchanged': 'CLAUDE.md 已是最新',
  'claudeMd.removed': '已从 CLAUDE.md 移除 @curdx/flow 区块',
  'claudeMd.skipped': '已跳过 CLAUDE.md 同步（--no-claude-md）',
  'claudeMd.failed': 'CLAUDE.md 同步失败：{error}',

  'analyze.description': '解析 Claude Code session jsonl + curdx-flow errors.jsonl，输出 markdown 报告',
  'analyze.helpSummary': 'analyze — 本地观测：合并 ~/.claude/projects/<cwd-encoded>/<sessionId>.jsonl 与 ~/.claude/curdx-flow/errors.jsonl，渲染 7 段 markdown（hook 失败 / slash command 频次 / subagent 调度 / spec 漏斗 / hook 时延 P50/P95/P99 / schema 漂移 / parentUuid 链完整性）',
  'analyze.flags.json': '输出 JSON 而非 markdown（CI 友好；与 --out 互斥语义：JSON 不写文件）',
  'analyze.flags.out': '把 markdown 报告写入指定文件（缺省写到 stdout）',
  'analyze.flags.limit': '表格段 Top-N 截断（默认 10；传 0 视为无意义回落 10）',
  'analyze.flags.since': '只统计相对窗口内的事件，例如 `7d` / `24h` / `30m`（默认全量；--since 与增量 offset 缓存共存，缓存命中时直接 replay 上次报告）',
  'analyze.flags.project': '指定 ~/.claude/projects/ 下的 encoded-cwd 子目录；缺省按当前 git 仓库根目录推断（非 git 目录退化为空报告 + warning）',
  'analyze.flags.includePrompts': '关闭默认 redact，把原始 prompt 文本透出（仅本地调试，谨慎使用；D-9 白名单默认裁剪所有未在白名单字段）',
  'analyze.warning.noProject': '未能从 cwd 推断到 ~/.claude/projects/ 子目录（非 git 仓库或无对应 session）；输出空报告，请用 --project 显式指定',
  'analyze.warning.schemaFallback': 'plugins/curdx-flow/schemas/transcript-events.json 未找到，回落到内置最小白名单——schema 漂移诊断可能漏报',
};

export default messages;
export type MessageKey = keyof typeof messages;

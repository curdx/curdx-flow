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
  'update.mcpAutoNote': '"{name}" 通过 npx -y 启动，每次运行自动拉取最新版本，无需手动更新。',
  'update.context7Note': 'context7 是远端 HTTP 服务，由服务端自动更新，本地无需操作。',

  'status.title': '当前状态',
  'status.headerName': '名称',
  'status.headerType': '类型',
  'status.headerState': '状态',

  'context7.askKey': '是否填写 context7 API Key？(回车跳过即用免费层)',
  'context7.keyPlaceholder': '粘贴 API Key，留空跳过',
  'context7.keyWarning': '注意：API Key 会以明文写入 ~/.claude.json，请妥善管理。',
  'context7.dashboardHint': '可在 https://context7.com/dashboard 创建 API Key',

  'chrome.prereqNode': '需要 Node.js >= 20.19，当前版本 {current}',
  'chrome.prereqChrome': '需要本机已安装 Chrome（chrome-devtools-mcp 会调用本地浏览器）',

  'reinstall.uninstalling': '先卸载旧版本…',
  'reinstall.installing': '安装新版本…',
};

export default messages;
export type MessageKey = keyof typeof messages;

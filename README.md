# @curdx/flow

Interactive installer for Claude Code plugins and MCP servers.

## Quick start

```bash
npx @curdx/flow
```

On first run you'll be asked to pick a language (中文 / English). Then choose what to install, update, uninstall, or just check status.

## Subcommands

```bash
npx @curdx/flow              # interactive menu
npx @curdx/flow install      # interactive install (current state-aware)
npx @curdx/flow install --all --yes
npx @curdx/flow uninstall
npx @curdx/flow update
npx @curdx/flow status
npx @curdx/flow status --json
npx @curdx/flow --lang en    # override language
```

## What it installs

| id | type | source |
| --- | --- | --- |
| `pua` | plugin | `tanweai/pua` → `pua@pua-skills` |
| `claude-mem` | plugin | `thedotmack/claude-mem` |
| `chrome-devtools-mcp` | plugin | `ChromeDevTools/chrome-devtools-mcp` |
| `frontend-design` | plugin | `claude-plugins-official` (built-in) |
| `sequential-thinking` | mcp | `@modelcontextprotocol/server-sequential-thinking` |
| `context7` | mcp | HTTP — `https://mcp.context7.com/mcp` (optional API key) |

## Requirements

- Node.js >= 20.12
- `claude` CLI installed and on `PATH` (this tool shells out to `claude plugin` and `claude mcp`)

## License

MIT

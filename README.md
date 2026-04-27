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
| `curdx-flow` | plugin | bundled in this repo (always installed) — spec-driven dev with autonomous task execution (originally [tzachbon/smart-ralph](https://github.com/tzachbon/smart-ralph), MIT, intermediate fork: ralph-specum) |
| `sequential-thinking` | mcp | `@modelcontextprotocol/server-sequential-thinking` |
| `context7` | mcp | HTTP — `https://mcp.context7.com/mcp` (optional API key) |

> Migration notes:
> - If you installed the upstream `ralph-specum@smart-ralph` build, run `claude plugin uninstall ralph-specum@smart-ralph` before upgrading.
> - If you installed `ralph-specum@curdx-flow` (curdx-flow v3.4.0 / v3.5.0), run `claude plugin uninstall ralph-specum@curdx-flow` and re-run `npx @curdx/flow install`. The plugin is now `curdx-flow@curdx` with slash namespace `/curdx-flow:*`.

## What it writes to your filesystem

After every successful `install` / `update` / `uninstall`, flow keeps a short managed block in your global `~/.claude/CLAUDE.md` so Claude Code knows at session start which tools are installed and when to use them. The block looks like:

```
<!-- BEGIN @curdx/flow v1 -->
## Tool Usage

Available tools/plugins:
- pua (v3.0.0) — `/pua:*` — auto-fires on 2+ failures or user frustration; ...
- ...

Rules:
- Do not call every tool by default; ...
- ...

Run `npx @curdx/flow` to install / update / uninstall.
<!-- END @curdx/flow v1 -->
```

Anything outside the BEGIN/END markers is preserved verbatim — flow only ever rewrites or removes the block itself. Uninstalling all managed items removes the block entirely. Pass `--no-claude-md` (or set `CURDX_FLOW_NO_CLAUDE_MD=1`) to opt out.

## Requirements

- Node.js >= 20.12
- `claude` CLI installed and on `PATH` (this tool shells out to `claude plugin` and `claude mcp`)

## License

MIT

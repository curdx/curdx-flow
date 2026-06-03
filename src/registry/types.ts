import type { Translate } from '../i18n/index.ts';
import type { InstallCtx, PrereqResult } from '../runner/types.ts';

export type { InstallCtx, PrereqResult };

export type PkgType = 'plugin' | 'mcp';

export type ConfigCtx = {
  t: Translate;
};

export type Pkg = {
  id: string;
  name: string;
  description: string;
  type: PkgType;

  prereqCheck?: (t: Translate) => Promise<PrereqResult>;

  isInstalled: () => Promise<boolean>;
  install: (ctx: InstallCtx) => Promise<void>;
  uninstall: (ctx: InstallCtx) => Promise<void>;
  /** Optional override; default behavior is uninstall + install. */
  update?: (ctx: InstallCtx) => Promise<void>;

  /** Prompt user for any required/optional config (e.g. API key). Returns string map merged into InstallCtx.config. */
  configPrompts?: (ctx: ConfigCtx) => Promise<Record<string, string> | null>;

  /** Currently installed version. Return null if unknown (MCPs / version-less plugins). */
  installedVersion?: () => Promise<string | null>;
  /** Latest version available upstream. Return null if unknown. */
  latestVersion?: () => Promise<string | null>;
  /** Marketplaces this pkg depends on; install flow refreshes them before reading latestVersion. */
  marketplaces?: () => string[];

  /**
   * WHEN to use this tool, in English. Rendered into the "Available tools/plugins"
   * list of the @curdx/flow block in ~/.claude/CLAUDE.md.
   * Style: a fragment beginning with "when ..." / "for ..." / "auto-fires on ...".
   * NOT a description of what the tool is — the plugin's own SKILL.md already covers that.
   * The unique value here is decision routing: telling Claude when to reach for it.
   */
  whenToUse?: string;

  /**
   * Slash invocation pattern, e.g. "/pua:*" or "/claude-mem:*". Only set for plugins
   * that expose an explicit slash namespace; auto-invoked plugins / MCP servers leave
   * this unset.
   */
  slashNamespace?: string;

  /**
   * Full "name@marketplace" id for plugin-type pkgs. The install flow reads this
   * during the post-install "ensure enabled" sweep so it can flip a previously
   * disabled plugin's enabledPlugins flag to true even when state was up_to_date
   * (and the normal install/update path was therefore skipped). MCPs leave this
   * unset.
   */
  pluginId?: string;

  /**
   * Required by the @curdx/flow bundle. When true:
   * - Hidden from the interactive install multiselect (rendered in an "always installed" header instead).
   * - Auto-added to install targets even when the user passes `--ids` without listing it.
   * - Skipped silently when state is up_to_date (nothing to do).
   * Does NOT affect uninstall / update flows — users may still uninstall manually;
   * the next install will re-add it.
   */
  required?: boolean;
};

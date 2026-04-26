import type { taskLog } from '@clack/prompts';
import type { Translate } from '../i18n/index.ts';

export type PkgType = 'plugin' | 'mcp';

export type PrereqResult = { ok: true } | { ok: false; reason: string };

export type InstallCtx = {
  log: ReturnType<typeof taskLog>;
  config: Record<string, string>;
  t: Translate;
};

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
};

import type { taskLog } from '@clack/prompts';
import type { Translate } from '../i18n/index.ts';

export type PrereqResult = { ok: true } | { ok: false; reason: string };

export type InstallCtx = {
  log: ReturnType<typeof taskLog>;
  t: Translate;
};

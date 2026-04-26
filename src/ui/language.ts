import * as p from '@clack/prompts';
import { setLang, t, type Lang } from '../i18n/index.ts';

function detectLang(): Lang {
  const env = process.env['LANG'] ?? process.env['LC_ALL'] ?? process.env['LC_MESSAGES'] ?? '';
  return /^zh/i.test(env) ? 'zh' : 'en';
}

export async function initLanguage(override?: Lang): Promise<void> {
  if (override) {
    setLang(override);
    return;
  }
  // Non-interactive (pipe / CI): just use the env-detected default, no prompt.
  if (!process.stdin.isTTY) {
    setLang(detectLang());
    return;
  }
  const picked = await p.select<Lang>({
    message: t('lang.prompt'),
    options: [
      { value: 'zh', label: '中文' },
      { value: 'en', label: 'English' },
    ],
    initialValue: detectLang(),
  });
  if (p.isCancel(picked)) {
    setLang(detectLang());
    process.exit(0);
  }
  setLang(picked);
}

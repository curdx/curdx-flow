import zh from './zh.ts';
import en from './en.ts';
import type { MessageKey } from './zh.ts';

export type Lang = 'zh' | 'en';

const tables: Record<Lang, Record<MessageKey, string>> = { zh, en };

let currentLang: Lang = 'zh';

export function setLang(lang: Lang): void {
  currentLang = lang;
}

export function getLang(): Lang {
  return currentLang;
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const raw = tables[currentLang][key] ?? tables.en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}

export type Translate = typeof t;
export type { MessageKey };

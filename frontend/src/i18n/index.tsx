/* eslint-disable react-refresh/only-export-components -- модуль i18n осознанно экспортирует провайдер, хук и константы */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { ru } from './locales/ru';
import { en } from './locales/en';
import { zh } from './locales/zh';
import { es } from './locales/es';

export type Locale = 'ru' | 'en' | 'zh' | 'es';

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
  { id: 'zh', label: '中文' },
  { id: 'es', label: 'Español' },
];

const DICTS: Record<Locale, Record<string, string>> = { ru, en, zh, es };
const STORAGE_KEY = 'ccl-locale';

interface I18nCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx>({
  locale: 'ru',
  setLocale: () => {},
  t: (k) => k,
});

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return (saved && saved in DICTS ? saved : 'ru') as Locale;
  });

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLocaleState(l);
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    const dict = DICTS[locale];
    const text = dict[key] ?? DICTS.ru[key] ?? key;
    return interpolate(text, vars);
  }, [locale]);

  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  return useContext(Ctx);
}

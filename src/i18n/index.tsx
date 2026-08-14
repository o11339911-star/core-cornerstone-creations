import * as React from "react";

import { ar } from "./locales/ar";
import { en } from "./locales/en";
import type { Translations } from "./locales/ar";

export type Locale = "ar" | "en";
export type Direction = "rtl" | "ltr";

const resources: Record<Locale, Translations> = { ar, en };

export const LOCALE_STORAGE_KEY = "rakeez.locale";
export const DEFAULT_LOCALE: Locale = "ar";

export const localeDirection: Record<Locale, Direction> = {
  ar: "rtl",
  en: "ltr",
};

type Vars = Record<string, string | number>;

function resolve(dict: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
      dict,
    );
}

function interpolate(value: string, vars?: Vars) {
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function translate(locale: Locale, key: string, vars?: Vars): string {
  const value = resolve(resources[locale], key) ?? resolve(resources[DEFAULT_LOCALE], key);
  if (typeof value !== "string") {
    if (import.meta.env.DEV) console.warn(`[i18n] missing translation key: ${key}`);
    return key;
  }
  return interpolate(value, vars);
}

type I18nContextValue = {
  locale: Locale;
  dir: Direction;
  isRtl: boolean;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: string, vars?: Vars) => string;
};

const I18nContext = React.createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  defaultLocale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode;
  defaultLocale?: Locale;
}) {
  const [locale, setLocaleState] = React.useState<Locale>(defaultLocale);

  // Read the persisted locale after hydration so SSR markup stays stable.
  React.useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "ar" || stored === "en") setLocaleState(stored);
  }, []);

  React.useEffect(() => {
    const dir = localeDirection[locale];
    document.documentElement.setAttribute("lang", locale);
    document.documentElement.setAttribute("dir", dir);
  }, [locale]);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  const value = React.useMemo<I18nContextValue>(
    () => ({
      locale,
      dir: localeDirection[locale],
      isRtl: localeDirection[locale] === "rtl",
      setLocale,
      toggleLocale: () => setLocale(locale === "ar" ? "en" : "ar"),
      t: (key: string, vars?: Vars) => translate(locale, key, vars),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (ctx) return ctx;
  // Safe fallback so components can render outside the provider (e.g. error shells).
  return {
    locale: DEFAULT_LOCALE,
    dir: localeDirection[DEFAULT_LOCALE],
    isRtl: true,
    setLocale: () => {},
    toggleLocale: () => {},
    t: (key: string, vars?: Vars) => translate(DEFAULT_LOCALE, key, vars),
  };
}

export function useT() {
  return useI18n().t;
}

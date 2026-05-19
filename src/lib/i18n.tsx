"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import esMessages from "../../messages/es.json";
import enMessages from "../../messages/en.json";

type Locale = "es" | "en";
export type Theme = "dark" | "light";
type Messages = typeof esMessages;

const MESSAGES: Record<Locale, Messages> = { es: esMessages, en: enMessages };

interface I18nContext {
  locale: Locale;
  t: (key: string, params?: Record<string, string | number>) => string;
  toggleLocale: () => void;
  theme: Theme;
  toggleTheme: () => void;
}

const Ctx = createContext<I18nContext | null>(null);

function resolve(messages: Messages, key: string): string {
  const parts = key.split(".");
  let node: Record<string, unknown> = messages as Record<string, unknown>;
  for (const p of parts) node = (node?.[p] ?? {}) as Record<string, unknown>;
  return typeof node === "string" ? (node as string) : key;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("es");
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const savedLocale = localStorage.getItem("locale") as Locale | null;
    if (savedLocale === "en") setLocale("en");

    const savedTheme = localStorage.getItem("theme") as Theme | null;
    if (savedTheme === "light") setTheme("light");
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale((prev) => {
      const next = prev === "es" ? "en" : "es";
      localStorage.setItem("locale", next);
      return next;
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("theme", next);
      return next;
    });
  }, []);

  const t = (key: string, params?: Record<string, string | number>) => {
    let result = resolve(MESSAGES[locale], key);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(`{${k}}`, String(v));
      }
    }
    return result;
  };

  return (
    <Ctx.Provider value={{ locale, t, toggleLocale, theme, toggleTheme }}>
      {children}
    </Ctx.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be inside I18nProvider");
  return ctx;
}

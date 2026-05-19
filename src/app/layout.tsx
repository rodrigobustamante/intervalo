"use client";

import { I18nProvider, useI18n } from "@/lib/i18n";
import "./globals.css";

function ControlBar() {
  const { locale, toggleLocale, theme, toggleTheme } = useI18n();
  const cls = theme === "dark"
    ? "text-white/50 border-white/20 hover:text-white hover:border-white/50"
    : "text-black/50 border-black/20 hover:text-black hover:border-black/50";
  return (
    <div className="fixed top-4 right-4 z-50 flex gap-2">
      <button
        onClick={toggleTheme}
        className={`text-xs font-mono focus-visible:ring-2 outline-none px-2 py-1 border transition-colors ${cls}`}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? "◑" : "◐"}
      </button>
      <button
        onClick={toggleLocale}
        className={`text-xs font-mono focus-visible:ring-2 outline-none px-2 py-1 border transition-colors ${cls}`}
        aria-label={locale === "es" ? "Switch to English" : "Cambiar a español"}
      >
        {locale === "es" ? "EN" : "ES"}
      </button>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <I18nProvider>
          {children}
          <ControlBar />
        </I18nProvider>
      </body>
    </html>
  );
}

"use client";

import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MONOCHROME_THEME_SLUG } from "@/lib/themes";

type ThemeContextValue = {
  theme: string;
  setTheme: (theme: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState(MONOCHROME_THEME_SLUG);

  const setTheme = useCallback((nextTheme: string) => {
    setThemeState(nextTheme || MONOCHROME_THEME_SLUG);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function usePortalTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("usePortalTheme must be used inside ThemeProvider.");
  return context;
}

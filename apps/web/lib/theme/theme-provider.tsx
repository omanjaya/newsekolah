"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { THEME_STORAGE_KEY } from "./theme-script";

export type ThemePreference = "system" | "light" | "dark";

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/**
 * Mirrors the inline bootstrap script (theme-script.ts) after hydration:
 * reads the stored preference once, then keeps `data-theme` on <html> and
 * localStorage in sync whenever the user toggles it. "system" removes the
 * attribute entirely so the `prefers-color-scheme` rules in
 * @newsekolah/ui-tokens take back over.
 */
export function ThemeProvider({ children }: { children: ReactNode }): ReactElement {
  // Starts at "system" (matches the server-rendered pass, which has no
  // localStorage) rather than a lazy initializer: reading the real stored
  // value immediately would make the client's first render disagree with
  // the server-rendered HTML for the same reason app/layout.tsx needs the
  // inline bootstrap script in the first place, which would surface here as
  // a hydration mismatch on ThemeToggle's icon. Updating after mount in an
  // effect is the deliberate, correct fix for that, not a shortcut around it.
  const [theme, setThemeState] = useState<ThemePreference>("system");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the note above `theme`'s useState.
    setThemeState(readStoredTheme());
  }, []);

  const setTheme = (next: ThemePreference) => {
    setThemeState(next);
    try {
      if (next === "system") {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      // Storage unavailable (private browsing): the in-memory state above
      // still applies the theme for this page load.
    }
    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", next);
    }
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

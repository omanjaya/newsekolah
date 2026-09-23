"use client";

import { PageHeader, cn } from "@newsekolah/ui";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useTheme, type ThemePreference } from "../../../lib/theme/theme-provider";

const OPTIONS: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: "system", icon: Monitor },
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
];

export function AppearanceView(): ReactElement {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("app.settings.appearance");
  const labelFor: Record<ThemePreference, string> = {
    system: t("themeSystem"),
    light: t("themeLight"),
    dark: t("themeDark"),
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4 md:max-w-xl">
        <div>
          <p className="text-[14px] font-medium text-fg">{t("themeLabel")}</p>
          <p className="text-[13px] text-fg-muted">{t("description")}</p>
        </div>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("themeLabel")}>
          {OPTIONS.map(({ value, icon: Icon }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setTheme(value);
                }}
                className={cn(
                  "flex min-h-20 flex-col items-center justify-center gap-2 rounded-sm border px-2 py-3 text-center text-[13px] font-medium transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  active
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-surface text-fg hover:bg-bg",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {labelFor[value]}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

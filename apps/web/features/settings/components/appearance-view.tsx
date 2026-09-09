"use client";

import { Button, PageHeader } from "@newsekolah/ui";
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
      <PageHeader title={t("title")} />
      <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <div>
          <p className="text-[14px] font-medium text-fg">{t("themeLabel")}</p>
          <p className="text-[13px] text-fg-muted">{t("description")}</p>
        </div>
        <div className="flex gap-2" role="radiogroup" aria-label={t("themeLabel")}>
          {OPTIONS.map(({ value, icon: Icon }) => (
            <Button
              key={value}
              type="button"
              variant={theme === value ? "primary" : "secondary"}
              role="radio"
              aria-checked={theme === value}
              icon={<Icon />}
              onClick={() => {
                setTheme(value);
              }}
            >
              {labelFor[value]}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}

"use client";

import { Field, FormSection, RadioGroup, RadioGroupItem } from "@newsekolah/ui";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useTheme, type ThemePreference } from "../../../lib/theme/theme-provider";

import { SettingsPage } from "./settings-page";

const OPTIONS: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: "system", icon: Monitor },
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
];

function isTheme(value: string): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** The theme of this device: follow the system, or always light or dark. Applies at once. */
export function AppearanceView(): ReactElement {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("app.settings.appearance");
  const labelFor: Record<ThemePreference, string> = {
    system: t("themeSystem"),
    light: t("themeLight"),
    dark: t("themeDark"),
  };
  const hintFor: Record<ThemePreference, string> = {
    system: t("themeSystemHint"),
    light: t("themeLightHint"),
    dark: t("themeDarkHint"),
  };

  return (
    <SettingsPage navKey="settings-appearance" description={t("description")}>
      <FormSection variant="card" columns={1} title={t("themeLabel")}>
        <Field label={t("themeLabel")} hideLabel hint={t("appliesNow")}>
          {(control) => (
            <RadioGroup
              variant="card"
              aria-labelledby={control.labelId}
              aria-describedby={control["aria-describedby"]}
              value={theme}
              onValueChange={(value) => {
                if (isTheme(value)) setTheme(value);
              }}
              className="grid gap-3 sm:grid-cols-3"
            >
              {OPTIONS.map(({ value, icon: Icon }) => (
                <RadioGroupItem
                  key={value}
                  value={value}
                  icon={<Icon />}
                  label={labelFor[value]}
                  description={hintFor[value]}
                />
              ))}
            </RadioGroup>
          )}
        </Field>
      </FormSection>
    </SettingsPage>
  );
}

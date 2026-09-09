"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
} from "@newsekolah/ui";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useTheme, type ThemePreference } from "../lib/theme/theme-provider";

const ICONS: Record<ThemePreference, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };

/** Compact header control; the same three-way choice appears as a fuller layout on settings/appearance. */
export function ThemeToggle(): ReactElement {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("app.settings.appearance");
  const Icon = ICONS[theme];

  const options: { value: ThemePreference; label: string }[] = [
    { value: "system", label: t("themeSystem") },
    { value: "light", label: t("themeLight") },
    { value: "dark", label: t("themeDark") },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={<Icon />} aria-label={t("themeLabel")} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => {
              setTheme(option.value);
            }}
            className="flex items-center justify-between gap-2"
          >
            {option.label}
            {theme === option.value && <Check className="size-4" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

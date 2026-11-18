"use client";

import { DropdownMenuGroup, DropdownMenuItem, SegmentedControl, cn } from "@newsekolah/ui";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useTheme, type ThemePreference } from "../lib/theme/theme-provider";

const ICONS: Record<ThemePreference, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };
const ORDER: ThemePreference[] = ["light", "dark", "system"];
const LABEL_KEYS = { light: "themeLight", dark: "themeDark", system: "themeSystem" } as const;

function isThemePreference(value: string): value is ThemePreference {
  return (ORDER as string[]).includes(value);
}

/**
 * Light, dark or system, as one segmented control: the account sheet on a
 * phone. The fuller page at settings/appearance offers the same choice.
 */
export function ThemeSwitch({ className }: { className?: string }): ReactElement {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("app.shell.account");
  return (
    <SegmentedControl
      aria-label={t("theme")}
      value={theme}
      fullWidth
      className={className}
      onValueChange={(value) => {
        if (isThemePreference(value)) setTheme(value);
      }}
      options={ORDER.map((value) => {
        const Icon = ICONS[value];
        return { value, label: t(LABEL_KEYS[value]), icon: <Icon /> };
      })}
    />
  );
}

/**
 * The same three-way choice inside the desktop account menu. A radio group
 * cannot live inside `role="menu"` (and the menu traps Tab), so the
 * segments are menu radio items on the segmented track: arrow keys reach
 * them like any other row, and choosing one keeps the menu open so the
 * change is seen.
 */
export function ThemeMenuSegments(): ReactElement {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("app.shell.account");
  return (
    <DropdownMenuGroup
      aria-label={t("theme")}
      className="mx-1.5 mb-1.5 grid grid-cols-3 gap-0.5 rounded-md bg-surface-sunken p-0.5"
    >
      {ORDER.map((value) => {
        const Icon = ICONS[value];
        const checked = theme === value;
        return (
          <DropdownMenuItem
            key={value}
            role="menuitemradio"
            aria-checked={checked}
            onSelect={(event) => {
              event.preventDefault();
              setTheme(value);
            }}
            className={cn(
              "h-8 justify-center gap-1.5 rounded-[calc(var(--radius-md)-2px)] px-2 text-caption font-semibold pointer-coarse:h-10 pointer-coarse:text-caption",
              checked
                ? "bg-surface-raised text-fg shadow-1 data-[highlighted]:bg-surface-raised [&>svg]:text-fg"
                : "text-fg-muted",
            )}
          >
            <Icon aria-hidden="true" />
            {t(LABEL_KEYS[value])}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuGroup>
  );
}

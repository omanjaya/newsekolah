"use client";

import { Tabs, TabsList, TabsTrigger, cn } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { DESK_MODES, type DeskMode } from "../lib/desk-basket";

const SHORTCUT_KEY: Record<DeskMode, string> = { borrow: "1", return: "2", renew: "3" };

/**
 * Switches the desk's continuous scan flow between Pinjam/Kembali/Perpanjang.
 * Each tab is one tap on a touchscreen, or Alt+1/2/3 without leaving the
 * scan input -- Alt is never emitted by a hardware barcode scanner
 * (lib/desk-basket.ts's `matchDeskShortcut`), so the shortcut can never
 * fire from a scan by accident.
 */
export function DeskModeTabs({
  mode,
  onModeChange,
  pendingCounts,
}: {
  mode: DeskMode;
  onModeChange: (mode: DeskMode) => void;
  /** Pending-item count per mode, shown as a small badge on Pinjam only (the only mode with a pending queue). */
  pendingCounts: Record<DeskMode, number>;
}): ReactElement {
  const t = useTranslations("app.library.desk.modes");

  return (
    <Tabs
      value={mode}
      onValueChange={(value) => {
        onModeChange(value as DeskMode);
      }}
    >
      <TabsList>
        {DESK_MODES.map((m) => (
          <TabsTrigger key={m} value={m} className="gap-1.5">
            {t(m)}
            {pendingCounts[m] > 0 && (
              <span
                className={cn(
                  "inline-flex min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-accent-fg",
                )}
              >
                {pendingCounts[m]}
              </span>
            )}
            <span className="hidden text-[11px] font-normal text-fg-muted md:inline">
              {t("shortcutHint", { key: SHORTCUT_KEY[m] })}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

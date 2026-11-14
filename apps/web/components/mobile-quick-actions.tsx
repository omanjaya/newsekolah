"use client";

import { IconCircle, Sheet, SheetContent, SheetTrigger, cn } from "@newsekolah/ui";
import { Zap } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QUICK_ACTION_TONE, sortQuickActions } from "../lib/navigation-quick-actions";
import { quickActionHref, type QuickAction } from "../lib/quick-actions";
import { useQuickActions } from "../lib/use-quick-actions";

import { CentreButton } from "./mobile-tab-slot";

/**
 * The reader's quick actions as tiles in a two-column grid: `tile` (an
 * icon in a soft circle over the label, the quick-action sheet) or `row`
 * (icon beside the label, a compact section of the Menu sheet).
 */
export function QuickActionGrid({
  actions,
  onNavigate,
  layout = "tile",
}: {
  actions: readonly QuickAction[];
  onNavigate: () => void;
  layout?: "tile" | "row";
}): ReactElement {
  const t = useTranslations("app.quickActions");
  const row = layout === "row";
  return (
    <ul className={cn("grid grid-cols-2", row ? "gap-2" : "gap-3")}>
      {actions.map((action) => (
        <li key={action.id} className="min-w-0">
          <Link
            href={quickActionHref(action)}
            onClick={(event) => {
              if (!event.defaultPrevented) onNavigate();
            }}
            className={cn(
              "flex h-full rounded-lg bg-surface text-label text-fg ring-1 ring-border outline-none motion-press active:bg-state-pressed",
              row
                ? "min-h-14 items-center gap-3 px-3 py-2"
                : "min-h-24 flex-col items-start gap-3 p-4",
            )}
          >
            <IconCircle tone={QUICK_ACTION_TONE[action.id]} size={row ? "sm" : "md"}>
              <action.icon />
            </IconCircle>
            <span className="min-w-0 break-words">{t(`actions.${action.labelKey}`)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The bar's centre action for a reader with several equally likely quick
 * actions (the school office and the like): the raised button opens all
 * of them as tiles in a bottom sheet. Renders nothing for a reader who can
 * perform none. It replaced the floating quick-action button, so nothing
 * floats over a page's last row any more.
 */
export function MobileQuickActions(): ReactElement | null {
  const [open, setOpen] = useState(false);
  const t = useTranslations("app.quickActions");
  const tBar = useTranslations("app.shell.tabBar.centre.quickActions");
  const tCommon = useTranslations("common");
  const actions = sortQuickActions(useQuickActions());

  if (actions.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <CentreButton icon={<Zap aria-hidden="true" />} label={tBar("label")} name={t("trigger")} />
      </SheetTrigger>
      <SheetContent title={t("title")} closeLabel={tCommon("actions.close")}>
        <QuickActionGrid
          actions={actions}
          onNavigate={() => {
            setOpen(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

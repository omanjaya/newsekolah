"use client";

import { IconCircle, Sheet, SheetContent, SheetTrigger, cn } from "@newsekolah/ui";
import { Zap } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { QUICK_ACTION_TONE, sortQuickActions } from "../lib/navigation-quick-actions";
import { quickActionHref } from "../lib/quick-actions";
import { useQuickActions } from "../lib/use-quick-actions";

/** Room the floating button needs below a page's last row, so it never covers it. */
const FAB_SPACE = "5rem";

/**
 * The quick-action button floating above the tab bar on a phone (not a
 * sixth tab), opening the reader's actions as a two-column grid of tiles in
 * a bottom sheet. Renders nothing for a reader who can perform none. It
 * rides above a StickySaveBar when one is showing, and publishes the space
 * it needs so the shell can pad the page's end clear of it.
 */
export function MobileQuickActions({ className }: { className?: string }): ReactElement | null {
  const [open, setOpen] = useState(false);
  const t = useTranslations("app.quickActions");
  const tCommon = useTranslations("common");
  const actions = sortQuickActions(useQuickActions());
  const visible = actions.length > 0;

  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    root.style.setProperty("--shell-fab-space", FAB_SPACE);
    return () => {
      root.style.removeProperty("--shell-fab-space");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t("trigger")}
          className={cn(
            "fixed right-4 z-sticky flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-3 outline-none motion-press",
            "bottom-[calc(var(--shell-mobile-tab-offset)+var(--sticky-save-bar-height,0px)+1rem)]",
            "hover:bg-accent-strong active:bg-accent-strong focus-visible:outline-offset-4",
            className,
          )}
        >
          <Zap className="size-6" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent title={t("title")} closeLabel={tCommon("actions.close")}>
        <ul className="grid grid-cols-2 gap-3">
          {actions.map((action) => (
            <li key={action.id} className="min-w-0">
              <Link
                href={quickActionHref(action)}
                onClick={(event) => {
                  if (!event.defaultPrevented) setOpen(false);
                }}
                className="flex h-full min-h-24 flex-col items-start gap-3 rounded-lg bg-surface p-4 text-label text-fg ring-1 ring-border outline-none motion-press active:bg-state-pressed"
              >
                <IconCircle tone={QUICK_ACTION_TONE[action.id]} size="md">
                  <action.icon />
                </IconCircle>
                <span className="min-w-0 break-words">{t(`actions.${action.labelKey}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

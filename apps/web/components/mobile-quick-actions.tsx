"use client";

import { Sheet, SheetContent, SheetTrigger } from "@newsekolah/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { quickActionHref } from "../lib/quick-actions";
import { useQuickActions } from "../lib/use-quick-actions";

/**
 * Compact "+" in the tab bar that opens the same quick actions as the
 * command palette. Renders nothing for a reader who can perform none, so the
 * tab bar keeps its layout for them.
 */
export function MobileQuickActions(): ReactElement | null {
  const [open, setOpen] = useState(false);
  const t = useTranslations("app.quickActions");
  const tCommon = useTranslations("common");
  const actions = useQuickActions();
  if (actions.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t("trigger")}
          className="mx-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg"
        >
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent title={t("title")} closeLabel={tCommon("actions.close")}>
        <ul className="grid gap-1 pb-[env(safe-area-inset-bottom)] sm:grid-cols-2">
          {actions.map((action) => (
            <li key={action.id}>
              <Link
                href={quickActionHref(action)}
                onClick={(event) => {
                  if (!event.defaultPrevented) setOpen(false);
                }}
                className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-[14px] text-fg hover:bg-bg"
              >
                <action.icon className="size-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{t(`actions.${action.labelKey}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

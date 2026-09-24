"use client";

import { Button, IconButton, Popover, PopoverContent, PopoverTrigger } from "@newsekolah/ui";
import { MoreHorizontal, RotateCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

/**
 * One overdue row's actions: Kembalikan (the desk's most common action for
 * a book that is actually in the librarian's hand right now) stays a
 * full-width primary button, Perpanjang and Tandai hilang collapse behind
 * a labelled "..." menu. Three bare buttons side by side used to squeeze a
 * mobile card's title column down to one word per line (docs/07-ui-ux.md
 * "aksi baris ikon dengan label" / the daily-flow brief's "one primary
 * action; secondary actions in a labelled '...' menu").
 */
export function DeskOverdueRowActions({
  onReturn,
  onRenew,
  onMarkLost,
  returning,
  renewing,
}: {
  onReturn: () => void;
  onRenew: () => void;
  onMarkLost: () => void;
  returning: boolean;
  renewing: boolean;
}): ReactElement {
  const t = useTranslations("app.library.desk.overdue");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" loading={returning} onClick={onReturn}>
        {t("return")}
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <IconButton icon={<MoreHorizontal />} aria-label={t("moreActions")} variant="outline" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled={renewing}
              className="flex min-h-11 items-center gap-2 rounded-xs px-2 text-left text-[13px] text-fg hover:bg-bg disabled:pointer-events-none disabled:opacity-50"
              onClick={() => {
                setOpen(false);
                onRenew();
              }}
            >
              <RotateCw className="size-4" aria-hidden="true" />
              {t("renew")}
            </button>
            <button
              type="button"
              className="flex min-h-11 items-center gap-2 rounded-xs px-2 text-left text-[13px] text-status-absent hover:bg-bg"
              onClick={() => {
                setOpen(false);
                onMarkLost();
              }}
            >
              <TriangleAlert className="size-4" aria-hidden="true" />
              {t("markLost")}
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

"use client";

import { IconButton, Popover, PopoverContent, PopoverTrigger, cn } from "@newsekolah/ui";
import { MoreHorizontal, Pencil, Save } from "lucide-react";
import type { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

/**
 * A component column's secondary actions, collapsed behind one "..." button
 * instead of a permanent "Simpan" button sitting in every column header at
 * once: the sticky bottom bar (`StickySaveBar`) already saves every changed
 * column in one action, so a second, always-visible save control per column
 * was two ways to do the same thing. Saving just this one column (useful
 * mid-entry, before the rest of the sheet is ready) is still one tap away,
 * just no longer competing for attention with the primary save action --
 * the same "actions menu instead of a row of buttons" move
 * `SessionRowActionsMenu` made for the attendance roster.
 */
export function GradebookColumnMenu({
  t,
  code,
  hasEdits,
  saving,
  disabled,
  onEditComponent,
  onSaveColumn,
}: {
  t: ReturnType<typeof useTranslations>;
  code: string;
  hasEdits: boolean;
  saving: boolean;
  /** True while this column has a value outside the grading scale: saving it would fail, so the action is disabled here too. */
  disabled: boolean;
  onEditComponent: () => void;
  onSaveColumn: () => void;
}): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton
          icon={<MoreHorizontal />}
          aria-label={t("columnMenu", { code })}
          variant="outline"
          className="size-8 md:size-6 [&>svg]:size-3.5"
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className="flex min-h-11 items-center gap-2 rounded-xs px-2 text-left text-[13px] text-fg hover:bg-bg"
            onClick={() => {
              onEditComponent();
              setOpen(false);
            }}
          >
            <Pencil className="size-4" aria-hidden="true" />
            {t("editComponent", { code })}
          </button>
          <button
            type="button"
            disabled={!hasEdits || disabled || saving}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-xs px-2 text-left text-[13px] text-fg hover:bg-bg",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
            onClick={() => {
              onSaveColumn();
              setOpen(false);
            }}
          >
            <Save className="size-4" aria-hidden="true" />
            {saving ? t("saving") : t("saveColumn")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import {
  Badge,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
  domainIcons,
} from "@newsekolah/ui";
import { ChevronLeft, MoreHorizontal, StickyNote } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import type { ViolationType } from "../../discipline/api";

import { ViolationChecklist } from "./violation-checklist";

/**
 * A roster row's secondary actions, collapsed behind one "..." button
 * instead of a note icon plus a violation icon side by side: the two
 * extra 44px targets used to push a phone row onto a second line for
 * every one of 36+ students (docs/07-ui-ux.md's row-height target). Menu
 * items carry full text labels (never bare icons) since they are no
 * longer squeezed for space the way the row itself is.
 */
export function SessionRowActionsMenu({
  studentName,
  noteActive,
  noteToggleDisabled,
  onToggleNote,
  violationIds,
  violationTypes,
  violationTypesLoading,
  disabled,
  onToggleViolation,
}: {
  studentName: string;
  noteActive: boolean;
  /** True when the note is forced open (a not-present status) and cannot be hidden from here. */
  noteToggleDisabled: boolean;
  onToggleNote: () => void;
  violationIds: string[];
  violationTypes: ViolationType[];
  violationTypesLoading: boolean;
  disabled: boolean;
  onToggleViolation: (violationTypeId: string) => void;
}): ReactElement {
  const t = useTranslations("app.attendance.session");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "violations">("menu");
  const hasViolations = violationIds.length > 0;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setView("menu");
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <IconButton
          icon={<MoreHorizontal />}
          aria-label={t("moreActions", { name: studentName })}
          variant="outline"
          disabled={disabled}
          className={cn(noteActive || hasViolations ? "border-accent text-accent" : undefined)}
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        {view === "menu" ? (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled={noteToggleDisabled}
              className="flex min-h-11 items-center gap-2 rounded-xs px-2 text-left text-[13px] text-fg hover:bg-bg disabled:pointer-events-none disabled:opacity-50"
              onClick={() => {
                onToggleNote();
                setOpen(false);
              }}
            >
              <StickyNote className="size-4" aria-hidden="true" />
              {noteActive ? t("noteMenuHide") : t("noteMenuAdd")}
            </button>
            <button
              type="button"
              className="flex min-h-11 items-center justify-between gap-2 rounded-xs px-2 text-left text-[13px] text-fg hover:bg-bg"
              onClick={() => {
                setView("violations");
              }}
            >
              <span className="flex items-center gap-2">
                <domainIcons.violation className="size-4" aria-hidden="true" />
                {t("violations.menuLabel")}
              </span>
              {hasViolations && <Badge variant="accent">{violationIds.length}</Badge>}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="flex min-h-8 items-center gap-1 text-[12px] text-fg-muted hover:text-fg"
              onClick={() => {
                setView("menu");
              }}
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              {t("menuBack")}
            </button>
            <p className="text-[13px] font-medium text-fg">{t("violations.title")}</p>
            <ViolationChecklist
              selected={violationIds}
              types={violationTypes}
              loading={violationTypesLoading}
              disabled={disabled}
              onToggle={onToggleViolation}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

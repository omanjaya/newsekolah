"use client";

import {
  CountBadge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  IconButton,
  cn,
  domainIcons,
} from "@newsekolah/ui";
import { MoreHorizontal, StickyNote } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useModuleEnabled } from "../../../lib/modules/use-module-enabled";
import type { ViolationType } from "../../discipline/api";

/**
 * A roster row's secondary actions, collapsed behind one "..." button
 * instead of a note icon plus a violation icon side by side: the two
 * extra 44px targets used to push a phone row onto a second line for
 * every one of 36+ students (docs/07-ui-ux.md's row-height target). A real
 * menu: the note toggle, then the violation types as a submenu of
 * checkable items, so a teacher ticks several without the menu closing.
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
  const tViolations = useTranslations("app.attendance.session.violations");
  // Recording a violation is a discipline action: no entry without the module,
  // and no highlight for violations kept from before it was switched off.
  const disciplineOn = useModuleEnabled("discipline");
  const hasViolations = disciplineOn && violationIds.length > 0;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={<MoreHorizontal />}
          aria-label={t("moreActions", { name: studentName })}
          variant="surface"
          disabled={disabled}
          className={cn(
            "shrink-0",
            noteActive || hasViolations ? "border-accent text-accent" : undefined,
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          icon={<StickyNote />}
          disabled={noteToggleDisabled}
          onSelect={onToggleNote}
        >
          {noteActive ? t("noteMenuHide") : t("noteMenuAdd")}
        </DropdownMenuItem>
        {disciplineOn && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <domainIcons.violation className="size-4 text-fg-muted" aria-hidden="true" />
              <span className="flex-1">{t("violations.menuLabel")}</span>
              {hasViolations && <CountBadge count={violationIds.length} tone="accent" />}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 w-64 overflow-y-auto">
              <DropdownMenuLabel>{t("violations.title")}</DropdownMenuLabel>
              {violationTypesLoading ? (
                <DropdownMenuLabel className="font-normal text-fg-muted">
                  {tViolations("loading")}
                </DropdownMenuLabel>
              ) : violationTypes.length === 0 ? (
                <DropdownMenuLabel className="font-normal text-fg-muted">
                  {tViolations("empty")}
                </DropdownMenuLabel>
              ) : (
                violationTypes.map((violationType) => (
                  <DropdownMenuCheckboxItem
                    key={violationType.id}
                    checked={violationIds.includes(violationType.id)}
                    disabled={disabled}
                    // Ticking one type keeps the list open for the next.
                    onSelect={(event) => {
                      event.preventDefault();
                    }}
                    onCheckedChange={() => {
                      onToggleViolation(violationType.id);
                    }}
                  >
                    <span className="flex-1">{violationType.name}</span>
                    <span className="text-caption text-fg-muted tabular-nums">
                      {tViolations("points", { points: violationType.points })}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

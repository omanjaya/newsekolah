"use client";

import { Checkbox, Skeleton } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { ViolationType } from "../../discipline/api";

/**
 * The violation-type checklist itself, with no trigger or popover chrome
 * of its own -- embedded inside `SessionRowActionsMenu`'s "Catat
 * pelanggaran" step so the roster row only carries one icon button
 * (docs/07-ui-ux.md's row-height target), not a separate one for this.
 */
export function ViolationChecklist({
  selected,
  types,
  loading,
  disabled,
  onToggle,
}: {
  selected: string[];
  types: ViolationType[];
  loading: boolean;
  disabled: boolean;
  onToggle: (violationTypeId: string) => void;
}): ReactElement {
  const t = useTranslations("app.attendance.session.violations");
  if (loading) return <Skeleton className="h-16 w-full" />;
  if (types.length === 0) return <p className="text-[13px] text-fg-muted">{t("empty")}</p>;
  return (
    <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
      {types.map((violationType) => (
        <li key={violationType.id}>
          <label className="flex items-center gap-2 text-[13px] text-fg">
            <Checkbox
              checked={selected.includes(violationType.id)}
              disabled={disabled}
              onCheckedChange={() => {
                onToggle(violationType.id);
              }}
            />
            <span className="flex-1">{violationType.name}</span>
            <span className="text-fg-muted">{violationType.points}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

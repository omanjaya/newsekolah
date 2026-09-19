"use client";

import {
  Checkbox,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  cn,
  domainIcons,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { ViolationType } from "../../discipline/api";

export function ViolationPicker({
  studentName,
  selected,
  types,
  loading,
  disabled,
  onToggle,
}: {
  studentName: string;
  selected: string[];
  types: ViolationType[];
  loading: boolean;
  disabled: boolean;
  onToggle: (violationTypeId: string) => void;
}): ReactElement {
  const t = useTranslations("app.attendance.session.violations");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={t("button", { name: studentName })}
          className={cn(
            "flex h-11 min-w-11 items-center gap-1 rounded-xs border border-border px-2 md:h-8",
            selected.length > 0 ? "border-status-absent text-status-absent" : "text-fg-muted",
          )}
        >
          <domainIcons.violation className="size-4" aria-hidden="true" />
          {selected.length > 0 && (
            <span className="text-[12px] font-medium">{selected.length}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <p className="mb-2 text-[13px] font-medium text-fg">{t("title")}</p>
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : types.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("empty")}</p>
        ) : (
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
        )}
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { Badge, Checkbox, cn } from "@newsekolah/ui";
import { Check, ChevronDown, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type ReactElement } from "react";

export interface PermissionRow {
  code: string;
  label: string;
  description: string;
  /** Granted only through a duty assignment for this role: shown, never toggled. */
  dutyOnly: boolean;
}

export interface PermissionGroupProps {
  label: string;
  /** The rows to show (already narrowed by the search and the filter). */
  rows: PermissionRow[];
  /** Every code of the group, for the group's count and its select-all box. */
  codes: string[];
  granted: ReadonlySet<string>;
  /** Unsaved changes: codes whose state differs from what is saved. */
  changed: ReadonlySet<string>;
  editable: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onToggle: (code: string, granted: boolean) => void;
  onToggleAll: (codes: string[], granted: boolean) => void;
}

/**
 * One permission group of a role: a header with the group's tally and,
 * when the role can be edited, a select-all box (indeterminate while only
 * some are on); the rows open and close under it. A read-only role shows
 * each permission as a tick or a dash at full contrast instead of a
 * dimmed, disabled checkbox, because whether it is granted is the point.
 */
export function PermissionGroup({
  label,
  rows,
  codes,
  granted,
  changed,
  editable,
  expanded,
  onExpandedChange,
  onToggle,
  onToggleAll,
}: PermissionGroupProps): ReactElement {
  const t = useTranslations("app.roles");
  const regionId = useId();
  const togglable = codes.filter((code) => !rows.some((row) => row.code === code && row.dutyOnly));
  const grantedCount = codes.filter((code) => granted.has(code)).length;
  const togglableOn = togglable.filter((code) => granted.has(code)).length;
  const groupChanged = codes.some((code) => changed.has(code));
  const allState =
    togglableOn === 0 ? false : togglableOn === togglable.length ? true : "indeterminate";

  return (
    <section className="flex flex-col">
      <div className="flex items-center gap-3 px-4 md:px-5">
        {editable && togglable.length > 0 && (
          <Checkbox
            checked={allState}
            aria-label={t("selectAll", { group: label })}
            onCheckedChange={(value) => {
              onToggleAll(togglable, value === true);
            }}
          />
        )}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={regionId}
          onClick={() => {
            onExpandedChange(!expanded);
          }}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-offset-2"
        >
          <span className="min-w-0 flex-1 truncate text-heading text-fg">{label}</span>
          {groupChanged && (
            <Badge tone="warning" size="sm" dot>
              {t("changed")}
            </Badge>
          )}
          <span className="shrink-0 text-body-sm tabular-nums text-fg-muted">
            {t("permissionCount", { granted: grantedCount, total: codes.length })}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-fg-muted transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
      </div>
      <ul id={regionId} hidden={!expanded} className="flex flex-col pb-2">
        {rows.map((row) => {
          const on = granted.has(row.code);
          const description = (
            <>
              {row.description}
              {row.dutyOnly && (
                <span className="mt-1 block text-caption text-fg-muted">{t("dutyOnlyHint")}</span>
              )}
            </>
          );
          return (
            <li
              key={row.code}
              className={cn(
                "mx-2 rounded-md px-2 md:mx-3",
                changed.has(row.code) && "bg-warning-soft",
              )}
            >
              {editable ? (
                <Checkbox
                  id={`perm-${row.code}`}
                  checked={on}
                  disabled={row.dutyOnly}
                  // Label and description are one label, so a tap anywhere
                  // on the text toggles the permission, not only the box.
                  label={
                    <span className="flex flex-col gap-0.5">
                      <span className="text-label">{row.label}</span>
                      <span className="text-body-sm text-fg-muted">{description}</span>
                    </span>
                  }
                  containerClassName="py-2.5 md:pointer-fine:py-2.5"
                  onCheckedChange={(value) => {
                    onToggle(row.code, value === true);
                  }}
                />
              ) : (
                <div className="flex items-start gap-3 py-2.5">
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                      on ? "bg-accent text-accent-fg" : "text-fg-muted",
                    )}
                  >
                    {on ? (
                      <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                    ) : (
                      <Minus className="size-3.5" aria-hidden="true" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={cn("text-label", on ? "text-fg" : "text-fg-muted")}>
                      {row.label}
                      <span className="sr-only">
                        {" "}
                        {on ? t("grantedState") : t("notGrantedState")}
                      </span>
                    </span>
                    <span className="text-body-sm text-fg-muted">{description}</span>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

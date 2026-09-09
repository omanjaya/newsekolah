"use client";

import { Dialog, DialogContent } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { AuditLogEntry } from "../api";

function renderJson(value: Record<string, unknown> | undefined, emptyLabel: string): string {
  if (!value || Object.keys(value).length === 0) return emptyLabel;
  return JSON.stringify(value, null, 2);
}

/**
 * Before/after diff shown as two preformatted, scrollable JSON columns:
 * the API returns arbitrary entity payloads, so a readable raw dump beats
 * a synthetic diff view that would need per-entity-type formatting rules.
 */
export function AuditLogDetailDialog({
  entry,
  onOpenChange,
}: {
  entry: AuditLogEntry | null;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.audit");

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent title={t("detail.title")} className="max-w-3xl">
        {entry && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
              <dt className="text-fg-muted">{t("columns.action")}</dt>
              <dd className="text-fg">{entry.action}</dd>
              <dt className="text-fg-muted">{t("columns.entity")}</dt>
              <dd className="text-fg">
                {entry.entity_type}
                {entry.entity_id ? ` · ${entry.entity_id}` : ""}
              </dd>
              {entry.request_id && (
                <>
                  <dt className="text-fg-muted">{t("detail.requestId")}</dt>
                  <dd className="text-fg">{entry.request_id}</dd>
                </>
              )}
            </dl>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <h3 className="text-[13px] font-medium text-fg">{t("detail.before")}</h3>
                <pre className="max-h-80 overflow-auto rounded-xs border border-border bg-bg p-3 text-[12px] text-fg">
                  {renderJson(entry.before, t("detail.noValue"))}
                </pre>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-[13px] font-medium text-fg">{t("detail.after")}</h3>
                <pre className="max-h-80 overflow-auto rounded-xs border border-border bg-bg p-3 text-[12px] text-fg">
                  {renderJson(entry.after, t("detail.noValue"))}
                </pre>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

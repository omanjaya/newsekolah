"use client";

import { formatDateTime, type Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  DataList,
  DataListItem,
  SectionHeader,
  Sheet,
  SheetContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useSession } from "../../../lib/session/session-provider";
import type { AuditLogEntry } from "../api";

import { useAuditLabels } from "./use-audit-labels";

type Payload = Record<string, unknown> | undefined;

function display(value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** The top-level fields whose value differs between before and after, in a stable order. */
export function changedFields(before: Payload, after: Payload): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys]
    .filter((key) => display(before?.[key]) !== display(after?.[key]))
    .sort((a, b) => a.localeCompare(b));
}

function renderJson(value: Payload, emptyLabel: string): string {
  if (!value || Object.keys(value).length === 0) return emptyLabel;
  return JSON.stringify(value, null, 2);
}

/**
 * One audit entry in a side drawer (a bottom sheet on a phone): what
 * happened, who, when and from where, then only the fields that changed
 * (before and after side by side), with the raw payloads one tap away.
 * The API returns arbitrary entity payloads, so the change table compares
 * top-level fields and leaves nested values as compact JSON.
 */
export function AuditLogDetailSheet({
  entry,
  actorName,
  onOpenChange,
}: {
  entry: AuditLogEntry | null;
  /** The actor's name, or undefined for the system. */
  actorName: (id: string | undefined) => string | undefined;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.audit");
  const labels = useAuditLabels();
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const [raw, setRaw] = useState(false);

  const fields = entry ? changedFields(entry.before, entry.after) : [];

  return (
    <Sheet
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) setRaw(false);
        onOpenChange(open);
      }}
    >
      <SheetContent
        side="right"
        size="lg"
        title={entry ? labels.action(entry.action) : t("detail.title")}
        description={entry ? labels.entityType(entry.entity_type) : undefined}
      >
        {entry && (
          <div className="flex flex-col gap-6">
            <DataList>
              <DataListItem label={t("columns.when")}>
                {formatDateTime(entry.occurred_at, { locale, timeZone: me?.tenant.timezone })}
              </DataListItem>
              <DataListItem label={t("columns.actor")}>
                <span className="flex flex-wrap items-center gap-1.5">
                  {actorName(entry.actor_user_id) ?? <Badge size="sm">{t("system")}</Badge>}
                  {entry.acting_as_user_id && (
                    <Badge size="sm" tone="warning">
                      {t("actingAs", { name: actorName(entry.acting_as_user_id) ?? "" })}
                    </Badge>
                  )}
                </span>
              </DataListItem>
              <DataListItem label={t("columns.entity")}>
                {labels.entityType(entry.entity_type)}
              </DataListItem>
              {entry.entity_id && (
                <DataListItem label={t("detail.entityId")}>
                  <span className="text-body-sm font-mono break-all">{entry.entity_id}</span>
                </DataListItem>
              )}
              <DataListItem label={t("columns.ip")}>{entry.ip}</DataListItem>
              {entry.request_id && (
                <DataListItem label={t("detail.requestId")}>
                  <span className="text-body-sm font-mono break-all">{entry.request_id}</span>
                </DataListItem>
              )}
              <DataListItem label={t("detail.code")}>
                <span className="text-body-sm font-mono">{entry.action}</span>
              </DataListItem>
            </DataList>

            <section className="flex flex-col gap-3">
              <SectionHeader
                as="h3"
                title={t("detail.changes")}
                count={fields.length}
                action={
                  <Button
                    variant="link"
                    size="sm"
                    aria-expanded={raw}
                    onClick={() => {
                      setRaw((value) => !value);
                    }}
                  >
                    {raw ? t("detail.hideRaw") : t("detail.showRaw")}
                  </Button>
                }
              />
              {fields.length === 0 ? (
                <p className="text-body-sm text-fg-muted">{t("detail.noChanges")}</p>
              ) : (
                <Table density="compact">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{t("detail.field")}</TableHead>
                      <TableHead scope="col">{t("detail.before")}</TableHead>
                      <TableHead scope="col">{t("detail.after")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field) => (
                      <TableRow key={field}>
                        <TableCell className="text-body-sm font-mono text-fg-muted">
                          {field}
                        </TableCell>
                        <TableCell className="text-body-sm break-all text-fg-muted">
                          {display(entry.before?.[field]) || "-"}
                        </TableCell>
                        <TableCell className="text-body-sm break-all text-fg">
                          {display(entry.after?.[field]) || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {raw && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["before", entry.before],
                      ["after", entry.after],
                    ] as const
                  ).map(([key, value]) => (
                    <div key={key} className="flex min-w-0 flex-col gap-1.5">
                      <p className="text-label text-fg">{t(`detail.${key}`)}</p>
                      <pre className="max-h-72 overflow-auto rounded-md bg-surface-sunken p-3 font-mono text-caption text-fg">
                        {renderJson(value, t("detail.noValue"))}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

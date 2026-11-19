"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import {
  Avatar,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  domainIcons,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useRef, useState } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { useDirectoryNames } from "../../reference/directory-names";

/** How many entries the desk keeps; it is a glance at the last minutes, not a report. */
const DESK_LOG_LIMIT = 30;

/**
 * One thing done at this desk. A manual record or review knows the
 * student's name already; a desk QR approval arrives by id only and is
 * named from the directory when shown.
 */
export interface DeskLogEntry {
  key: string;
  kind: "exit" | "late" | "review" | "exitApproved";
  studentName?: string;
  studentUserId?: string;
  at: string;
}

type NewDeskLogEntry = Omit<DeskLogEntry, "key" | "at"> & { key?: string };

/** The desk's own log, newest first, kept for as long as the page stays open. */
export function useDeskLog(): {
  entries: DeskLogEntry[];
  remember: (entry: NewDeskLogEntry) => void;
} {
  const [entries, setEntries] = useState<DeskLogEntry[]>([]);
  const counter = useRef(0);
  const remember = useCallback((entry: NewDeskLogEntry) => {
    counter.current += 1;
    const key = entry.key ?? `${entry.kind}:${String(counter.current)}`;
    const at = businessNow().toISOString();
    setEntries((prev) =>
      prev.some((item) => item.key === key)
        ? prev
        : [{ ...entry, key, at }, ...prev].slice(0, DESK_LOG_LIMIT),
    );
  }, []);
  return { entries, remember };
}

/** What was recorded, reviewed or approved at this desk since the page opened. */
export function DeskLog({ entries }: { entries: DeskLogEntry[] }): ReactElement {
  const t = useTranslations("app.duty.log");
  const tLate = useTranslations("app.permits.late");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  const names = useDirectoryNames(entries.map((entry) => entry.studentUserId));
  const nameOf = (entry: DeskLogEntry) =>
    entry.studentName ??
    (entry.studentUserId ? names.get(entry.studentUserId)?.name : undefined) ??
    tLate("unknownStudent");

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      {entries.length === 0 ? (
        <CardContent>
          <EmptyState
            variant="compact"
            icon={<domainIcons.document aria-hidden="true" />}
            title={t("empty")}
          />
        </CardContent>
      ) : (
        <List dense>
          {entries.map((entry) => (
            <ListRow
              key={entry.key}
              leading={<Avatar size={32} name={nameOf(entry)} decorative />}
              title={nameOf(entry)}
              titleLines={2}
              meta={t(`kinds.${entry.kind}`)}
              trailing={formatTime(entry.at, { locale, timeZone })}
            />
          ))}
        </List>
      )}
    </Card>
  );
}

"use client";

import { type components } from "@newsekolah/api-client";
import {
  Badge,
  Card,
  Disclosure,
  DisclosureContent,
  DisclosureIndicator,
  DisclosureTrigger,
  EmptyState,
  List,
  ListRow,
  SectionHeader,
  StatusBadge,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { statusToken } from "../lib/status-tokens";

type DailyReportSession = components["schemas"]["AttendanceDailyReportSession"];

/**
 * Per-session detail behind the daily report's aggregate table: which
 * session it was, whether it was submitted, and (expanded) every
 * student's entry for that session specifically -- the level the
 * aggregate status_code cannot show once a student's day mixes statuses
 * across sessions. An entry of a student who has since left the class
 * stays, since it is that lesson's record, but says so: the student table
 * above lists the class's current roster only.
 */
export function AttendanceDailySessions({
  sessions,
}: {
  sessions: DailyReportSession[];
}): ReactElement | null {
  const t = useTranslations("app.attendanceReports.daily");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (sessions.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader as="h3" title={t("sessionsTitle")} count={sessions.length} />
      <div className="flex flex-col gap-2">
        {sessions.map((session) => {
          const isOpen = expandedId === session.session_id;
          return (
            <Card key={session.session_id} className="overflow-hidden">
              <Disclosure
                open={isOpen}
                onOpenChange={(open) => {
                  setExpandedId(open ? session.session_id : null);
                }}
              >
                {/* The whole header opens the session's entries. */}
                <DisclosureTrigger className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-state-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring">
                  <span className="flex min-w-0 items-center gap-3">
                    <DisclosureIndicator />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-label text-fg">
                        {session.period_label} · {session.subject_name}
                      </span>
                      <span className="truncate text-body-sm text-fg-muted">
                        {session.teacher_name}
                      </span>
                    </span>
                  </span>
                  <Badge tone={session.submitted_at ? "success" : "warning"} size="sm" dot>
                    {session.submitted_at ? t("sessionSubmitted") : t("sessionPending")}
                  </Badge>
                </DisclosureTrigger>
                <DisclosureContent className="border-t border-line">
                  {session.entries.length === 0 ? (
                    <EmptyState variant="compact" title={t("sessionNoEntries")} className="px-5" />
                  ) : (
                    <List dense>
                      {session.entries.map((entry) => {
                        const token = statusToken(entry.status_code);
                        return (
                          <ListRow
                            key={entry.student_user_id}
                            title={entry.name}
                            meta={
                              [entry.left_class ? t("entryLeftClass") : "", entry.notes ?? ""]
                                .filter(Boolean)
                                .join(" · ") || undefined
                            }
                            trailing={
                              token ? (
                                <StatusBadge
                                  status={token}
                                  size="sm"
                                  label={t(`codes.${entry.status_code}`)}
                                />
                              ) : (
                                <Badge tone="neutral" size="sm">
                                  {t(`codes.${entry.status_code}`)}
                                </Badge>
                              )
                            }
                          />
                        );
                      })}
                    </List>
                  )}
                </DisclosureContent>
              </Disclosure>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

"use client";

import { type components } from "@newsekolah/api-client";
import {
  Badge,
  Card,
  EmptyState,
  List,
  ListRow,
  SectionHeader,
  StatusBadge,
  cn,
} from "@newsekolah/ui";
import { ChevronDown } from "lucide-react";
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
 * across sessions.
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
          const panelId = `daily-session-${session.session_id}`;
          return (
            <Card key={session.session_id} className="overflow-hidden">
              {/* The whole header opens the session's entries. */}
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-state-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
                onClick={() => {
                  setExpandedId(isOpen ? null : session.session_id);
                }}
                aria-expanded={isOpen}
                aria-controls={panelId}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-fg-muted transition-transform",
                      !isOpen && "-rotate-90",
                    )}
                    aria-hidden="true"
                  />
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
              </button>
              {isOpen && (
                <div id={panelId} className="border-t border-line">
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
                            meta={entry.notes === "" ? undefined : entry.notes}
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
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

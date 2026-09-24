"use client";

import { type components } from "@newsekolah/api-client";
import { Badge, StatusBadge } from "@newsekolah/ui";
import { ChevronDown, ChevronRight } from "lucide-react";
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
    <section className="flex flex-col gap-2">
      <h3 className="text-[14px] font-medium text-fg">{t("sessionsTitle")}</h3>
      <ul className="flex flex-col gap-2">
        {sessions.map((session) => {
          const isOpen = expandedId === session.session_id;
          return (
            <li key={session.session_id} className="rounded-sm border border-border bg-surface">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-3 text-left"
                onClick={() => {
                  setExpandedId(isOpen ? null : session.session_id);
                }}
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2">
                  {isOpen ? (
                    <ChevronDown className="size-4 text-fg-muted" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="size-4 text-fg-muted" aria-hidden="true" />
                  )}
                  <div className="flex flex-col">
                    <span className="text-[14px] font-medium text-fg">
                      {session.period_label} &middot; {session.subject_name}
                    </span>
                    <span className="text-[13px] text-fg-muted">{session.teacher_name}</span>
                  </div>
                </div>
                <Badge variant={session.submitted_at ? "accent" : "neutral"}>
                  {session.submitted_at ? t("sessionSubmitted") : t("sessionPending")}
                </Badge>
              </button>
              {isOpen && (
                <ul className="divide-y divide-border border-t border-border">
                  {session.entries.length === 0 ? (
                    <li className="px-3 py-3 text-[13px] text-fg-muted">{t("sessionNoEntries")}</li>
                  ) : (
                    session.entries.map((entry) => {
                      const token = statusToken(entry.status_code);
                      return (
                        <li
                          key={entry.student_user_id}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]"
                        >
                          <span className="text-fg">{entry.name}</span>
                          <div className="flex items-center gap-2">
                            {entry.notes && <span className="text-fg-muted">{entry.notes}</span>}
                            {token ? (
                              <StatusBadge status={token} label={t(`codes.${entry.status_code}`)} />
                            ) : (
                              <span className="text-fg-muted">
                                {t(`codes.${entry.status_code}`)}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

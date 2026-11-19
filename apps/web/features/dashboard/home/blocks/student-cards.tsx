"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatShortDate } from "@newsekolah/i18n";
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  SkeletonList,
  TextLink,
} from "@newsekolah/ui";
import { ClipboardList, LibraryBig } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../../components/query-error";
import type { LibraryMyProfile } from "../../../library/me-api";
import type { LeaveRequestSummary } from "../../../permits/api";
import { WorkflowStatusBadge } from "../../../permits/components/workflow-stepper";

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

interface QueryState {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** The student's own latest leave requests, each opening its detail. */
export function StudentLeaveCard({
  query,
  items,
  timeZone,
  leaveHref,
  submitHref,
}: {
  query: QueryState;
  items: LeaveRequestSummary[];
  timeZone: string;
  leaveHref: string;
  submitHref: string;
}): ReactElement {
  const t = useTranslations("app.dashboardStudent");
  const tLeave = useTranslations("app.permits.leave");
  const locale = useLocale() as Locale;
  return (
    <Card>
      <CardHeader action={<TextLink href={submitHref}>{t("leaveAction")}</TextLink>}>
        <CardTitle as="h2">{t("leaveTitle")}</CardTitle>
      </CardHeader>
      {query.isLoading ? (
        <div className="px-5 pb-5">
          <SkeletonList rows={2} framed={false} />
        </div>
      ) : query.isError ? (
        <div className="px-5 pb-5">
          <QueryError retry={query.refetch} error={query.error} />
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState variant="compact" icon={<ClipboardList />} title={t("leaveEmpty")} />
        </div>
      ) : (
        <List>
          {items.map((item) => (
            <ListRow
              key={item.instance_id}
              href={`${leaveHref}/${item.instance_id}`}
              title={tLeave(`categories.${item.category}`)}
              meta={formatShortDate(item.opened_at, { locale, timeZone })}
              trailing={<WorkflowStatusBadge status={item.status} />}
            />
          ))}
        </List>
      )}
    </Card>
  );
}

/** The student's active library loans; an overdue one says by how many days, not only in colour. */
export function StudentLibraryCard({
  query,
  loans,
  today,
  timeZone,
  libraryHref,
}: {
  query: QueryState;
  loans: LibraryMyProfile["active_loans"];
  today: string;
  timeZone: string;
  libraryHref: string;
}): ReactElement {
  const t = useTranslations("app.dashboardStudent");
  const locale = useLocale() as Locale;
  return (
    <Card>
      <CardHeader action={<TextLink href={libraryHref}>{t("libraryAction")}</TextLink>}>
        <CardTitle as="h2">{t("libraryTitle")}</CardTitle>
      </CardHeader>
      {query.isLoading ? (
        <div className="px-5 pb-5">
          <SkeletonList rows={2} framed={false} />
        </div>
      ) : query.isError ? (
        <div className="px-5 pb-5">
          <QueryError retry={query.refetch} error={query.error} />
        </div>
      ) : loans.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState variant="compact" icon={<LibraryBig />} title={t("libraryEmpty")} />
        </div>
      ) : (
        <List>
          {loans.map((loan) => {
            const lateDays = daysBetween(loan.due_on, today);
            return (
              <ListRow
                key={loan.id}
                title={loan.title_name ?? loan.title_id}
                meta={t("loanDue", { date: formatShortDate(loan.due_on, { locale, timeZone }) })}
                trailing={
                  lateDays > 0 ? (
                    <Badge tone="danger" size="sm">
                      {t("loanLate", { days: lateDays })}
                    </Badge>
                  ) : undefined
                }
              />
            );
          })}
        </List>
      )}
    </Card>
  );
}

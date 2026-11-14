import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  IconCircle,
  List,
  ListRow,
  SkeletonList,
} from "@newsekolah/ui";
import { BookOpen } from "lucide-react";
import { useLocale } from "next-intl";
import type { ReactElement } from "react";

import type { KioskMemberSession } from "../kiosk-session";
import { classifyDueDate, overdueDays } from "../lib/due-date";
import { formatShortDate } from "../lib/short-date";

export interface KioskMemberPanelProps {
  session: KioskMemberSession;
  /** The school's calendar day, "YYYY-MM-DD". */
  today: string;
  heading: string;
  dueOnLabel: (date: string) => string;
  overdueLabel: (days: number) => string;
  emptyLabel: string;
}

/**
 * The reader's own loans at the kiosk, large enough to read standing in
 * front of the screen: each title with its due date, late ones in danger
 * with the number of days, never colour alone.
 */
export function KioskMemberPanel({
  session,
  today,
  heading,
  dueOnLabel,
  overdueLabel,
  emptyLabel,
}: KioskMemberPanelProps): ReactElement {
  const locale = useLocale() as Locale;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{heading}</CardTitle>
      </CardHeader>
      {session.isLoading ? (
        <div className="px-5 pb-5">
          <SkeletonList rows={2} />
        </div>
      ) : session.activeLoans.length === 0 ? (
        <p className="px-5 pb-5 text-body text-fg-muted">{emptyLabel}</p>
      ) : (
        <List>
          {session.activeLoans.map(({ loan, titleName }) => {
            const overdue = classifyDueDate(loan.due_on, today) === "overdue";
            return (
              <ListRow
                key={loan.id}
                leading={
                  <IconCircle tone={overdue ? "danger" : "accent"}>
                    <BookOpen />
                  </IconCircle>
                }
                title={<span className="text-heading">{titleName}</span>}
                trailing={
                  <Badge tone={overdue ? "danger" : "neutral"} size="md">
                    {overdue
                      ? overdueLabel(overdueDays(loan.due_on, today))
                      : dueOnLabel(formatShortDate(loan.due_on, locale, { today }))}
                  </Badge>
                }
              />
            );
          })}
        </List>
      )}
    </Card>
  );
}

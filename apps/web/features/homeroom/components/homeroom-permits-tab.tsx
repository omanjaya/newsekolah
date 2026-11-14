"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CountBadge,
  EmptyState,
  List,
  ListRow,
  SkeletonList,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { formatDisplayName } from "../../../lib/text/format-name";
import { useExitPermitReviewQueueQuery, useLeaveReviewQueueQuery } from "../../permits/api";

/**
 * Pending leave requests and exit permits for the students of one
 * homeroom class. Both review queues are scoped to the caller's own
 * approval stage by the API; this narrows them to the class by `class_id`.
 */
export function HomeroomPermitsTab({
  classId,
  timeZone,
}: {
  classId: string;
  timeZone?: string;
}): ReactElement {
  const t = useTranslations("app.homeroom");
  const locale = useLocale() as Locale;
  const leaveQueue = useLeaveReviewQueueQuery();
  const exitQueue = useExitPermitReviewQueueQuery();

  const leave = (leaveQueue.data?.data ?? []).filter((item) => item.class_id === classId);
  const exits = (exitQueue.data?.data ?? []).filter((item) => item.class_id === classId);
  const review = (
    <Badge tone="warning" size="sm">
      {t("pendingLeaveReview")}
    </Badge>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <QueueCard
        title={t("pendingLeaveTitle")}
        count={leave.length}
        loading={leaveQueue.isLoading}
        empty={t("pendingLeaveEmpty")}
      >
        {leave.map((item) => (
          <ListRow
            key={item.instance_id}
            title={formatDisplayName(item.student_name)}
            meta={`${formatDate(item.starts_on, { locale, timeZone })} – ${formatDate(item.ends_on, { locale, timeZone })}`}
            trailing={review}
            href={`/leave-requests/${item.instance_id}`}
          />
        ))}
      </QueueCard>

      <QueueCard
        title={t("exitPermitsTitle")}
        count={exits.length}
        loading={exitQueue.isLoading}
        empty={t("exitPermitsEmpty")}
      >
        {exits.map((item) => (
          <ListRow
            key={item.instance_id}
            title={formatDisplayName(item.student_name ?? "")}
            meta={item.destination}
            trailing={review}
            href="/exit-permits"
          />
        ))}
      </QueueCard>
    </div>
  );
}

function QueueCard({
  title,
  count,
  loading,
  empty,
  children,
}: {
  title: string;
  count: number;
  loading: boolean;
  empty: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          {title}
          {!loading && <CountBadge count={count} tone="accent" />}
        </CardTitle>
      </CardHeader>
      {loading ? (
        <CardContent className="pt-0">
          <SkeletonList rows={2} framed={false} />
        </CardContent>
      ) : count === 0 ? (
        <CardContent className="pt-0">
          <EmptyState variant="compact" title={empty} />
        </CardContent>
      ) : (
        <List>{children}</List>
      )}
    </Card>
  );
}

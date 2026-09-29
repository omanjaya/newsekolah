"use client";

import { Card, CardContent, PageHeader } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { LeaveRequestDetail } from "./leave-request-detail";

/** Full-page variant of the leave request detail, opened from notifications. */
export function LeaveRequestPageView({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.permits.leave");
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("detailTitle")}
        breadcrumb={[{ label: t("title"), href: "/leave-requests" }, { label: t("detailTitle") }]}
      />
      <Card className="max-w-2xl">
        <CardContent className="p-4 md:p-6">
          <LeaveRequestDetail id={id} />
        </CardContent>
      </Card>
    </div>
  );
}

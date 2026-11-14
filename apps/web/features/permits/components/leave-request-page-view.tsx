"use client";

import { Card } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";

import { LeaveRequestDetail } from "./leave-request-detail";

/** Full-page variant of the leave request detail, opened from notifications. */
export function LeaveRequestPageView({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.permits.leave");
  return (
    <AppPage variant="narrow" title={t("detailTitle")}>
      <Card padding="md">
        <LeaveRequestDetail id={id} />
      </Card>
    </AppPage>
  );
}

"use client";

import { ApiError } from "@newsekolah/api-client";
import { Card } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { RecordNotFoundPage } from "../../../components/record-not-found";
import { isNotFoundError } from "../../../lib/api/not-found";
import { useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useExitPermitQuery } from "../api";

import { ActiveExitPermitCard, ExitPermitDetail } from "./exit-permit-detail";

/**
 * One exit permit's own page, the target of its notifications
 * ("/exit-permits/{id}"). The student whose permit is still on its way gets
 * their live card (the stage scan, then the gate QR); everyone else, and
 * the student once it is over, the read-only record. An unknown id, or one
 * the reader may not open (which reads the same, so no id is confirmed),
 * gets the shared not-found page.
 */
export function ExitPermitPageView({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.permits.exit");
  const { me } = useSession();
  const { data, error } = useExitPermitQuery(id);

  if (!data && (isNotFoundError(error) || (error instanceof ApiError && error.status === 403))) {
    return (
      <RecordNotFoundPage
        title={t("notFoundTitle")}
        description={t("notFoundBody")}
        backHref="/exit-permits"
        backLabel={t("notFoundBack")}
      />
    );
  }

  const inst = data?.instance;
  const live =
    inst !== undefined &&
    inst.subject_user_id === me?.id &&
    (inst.status === "in_progress" || inst.status === "approved");

  return (
    <AppPage
      variant="narrow"
      title={t("detailTitle")}
      description={
        data ? `${formatDisplayName(data.student_name)} (${data.class_name})` : undefined
      }
    >
      {live ? (
        <ActiveExitPermitCard id={id} />
      ) : (
        <Card padding="md">
          <ExitPermitDetail id={id} />
        </Card>
      )}
    </AppPage>
  );
}

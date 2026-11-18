"use client";

import type { components } from "@newsekolah/api-client";
import { EmptyState, List, ListRow, SkeletonList } from "@newsekolah/ui";
import { UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatDisplayName } from "../../../lib/text/format-name";
import { studentProfileHref } from "../../students/href";

import { GuardianContactActions } from "./guardian-contact-actions";

type Entry = components["schemas"]["AttendanceHomeroomEntry"];

/** Guardian contact list for every student of the homeroom class. */
export function HomeroomParentsTab({
  rows,
  isLoading,
}: {
  rows: Entry[];
  isLoading: boolean;
}): ReactElement {
  const t = useTranslations("app.homeroom");

  if (isLoading) return <SkeletonList rows={6} />;
  if (rows.length === 0) {
    return <EmptyState icon={<UsersRound aria-hidden="true" />} title={t("emptyTitle")} />;
  }

  return (
    <List framed>
      {rows.map((row) => {
        const name = formatDisplayName(row.name);
        return (
          <ListRow
            key={row.student_user_id}
            title={name}
            meta={
              row.guardian_name || row.guardian_phone
                ? [row.guardian_name, row.guardian_phone].filter(Boolean).join(" · ")
                : t("noGuardian")
            }
            href={studentProfileHref(row.student_user_id)}
            action={
              row.guardian_phone ? (
                <GuardianContactActions phone={row.guardian_phone} studentName={name} />
              ) : undefined
            }
          />
        );
      })}
    </List>
  );
}

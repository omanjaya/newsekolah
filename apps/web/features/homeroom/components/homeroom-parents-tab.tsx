"use client";

import type { components } from "@newsekolah/api-client";
import { EmptyState, Skeleton } from "@newsekolah/ui";
import { MessageCircle, Phone, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatDisplayName } from "../../../lib/text/format-name";
import { StudentLink } from "../../students/components/student-link";
import { telHref, whatsAppHref } from "../lib/guardian-contact";

type Entry = components["schemas"]["AttendanceHomeroomEntry"];

const CONTACT_LINK =
  "inline-flex size-11 items-center justify-center rounded-sm border border-border text-fg transition-colors hover:bg-bg md:size-8";

/** Guardian contact list for every student of the homeroom class. */
export function HomeroomParentsTab({
  rows,
  isLoading,
}: {
  rows: Entry[];
  isLoading: boolean;
}): ReactElement {
  const t = useTranslations("app.homeroom");

  if (isLoading) return <Skeleton className="h-24 w-full" aria-busy="true" />;
  if (rows.length === 0) {
    return <EmptyState icon={<UsersRound aria-hidden="true" />} title={t("emptyTitle")} />;
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface px-4">
      {rows.map((row) => (
        <li key={row.student_user_id} className="flex items-center justify-between gap-2 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] text-fg">
              <StudentLink studentId={row.student_user_id}>
                {formatDisplayName(row.name)}
              </StudentLink>
            </span>
            <span className="truncate text-[12px] text-fg-muted">
              {row.guardian_name || row.guardian_phone
                ? [row.guardian_name, row.guardian_phone].filter(Boolean).join(" · ")
                : t("noGuardian")}
            </span>
          </div>
          {row.guardian_phone && (
            <div className="flex shrink-0 items-center gap-1.5">
              <a
                href={telHref(row.guardian_phone)}
                aria-label={t("contactCall", { name: formatDisplayName(row.name) })}
                className={CONTACT_LINK}
              >
                <Phone className="size-4" aria-hidden="true" />
              </a>
              <a
                href={whatsAppHref(row.guardian_phone)}
                target="_blank"
                rel="noreferrer"
                aria-label={t("contactWhatsapp", { name: formatDisplayName(row.name) })}
                className={CONTACT_LINK}
              >
                <MessageCircle className="size-4" aria-hidden="true" />
              </a>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

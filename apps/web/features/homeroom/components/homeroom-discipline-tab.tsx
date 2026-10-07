"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Badge, EmptyState, Skeleton, domainIcons } from "@newsekolah/ui";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useViolationsQuery } from "../../discipline/api";
import { useDirectoryQuery, useLookup } from "../../reference/api";

/** Violation records of one homeroom class, as the API orders them. */
export function HomeroomDisciplineTab({ classId }: { classId: string }): ReactElement {
  const t = useTranslations("app.homeroom");
  const locale = useLocale() as Locale;
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const { data, isLoading } = useViolationsQuery({
    classId,
    from: "",
    to: "",
    includeVoided: false,
  });
  const items = data?.data ?? [];

  if (isLoading) return <Skeleton className="h-24 w-full" aria-busy="true" />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<domainIcons.violation aria-hidden="true" />}
        title={t("disciplineEmpty")}
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface px-4">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/discipline/students/${item.student_user_id}`}
            className="flex items-center justify-between gap-2 py-3 hover:text-accent"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] text-fg">
                {studentMap.get(item.student_user_id)?.name ?? t("unknownStudent")}
              </span>
              <span className="truncate text-[12px] text-fg-muted">
                {item.type_name} · {formatDate(item.occurred_on, { locale })}
              </span>
            </div>
            <Badge variant="accent">{t("pointsBadge", { points: item.points })}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

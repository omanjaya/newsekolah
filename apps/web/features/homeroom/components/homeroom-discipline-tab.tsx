"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Badge, EmptyState, Skeleton, domainIcons } from "@newsekolah/ui";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { CursorPagination } from "../../../components/cursor-pagination";
import { useOffsetPage } from "../../../lib/hooks/use-offset-page";
import { useViolationsQuery } from "../../discipline/api";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import { studentProfileHref } from "../../students/href";

/** Rows per page; the violations API pages by offset and reports no total. */
const PAGE_SIZE = 50;

/** Violation records of one homeroom class, as the API orders them. */
export function HomeroomDisciplineTab({ classId }: { classId: string }): ReactElement {
  const t = useTranslations("app.homeroom");
  const locale = useLocale() as Locale;
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const paging = useOffsetPage(PAGE_SIZE, "discipline_page");
  const { data, isLoading } = useViolationsQuery(
    { classId, from: "", to: "", includeVoided: false },
    { limit: paging.limit, offset: paging.offset },
  );
  const items = data?.data ?? [];

  if (isLoading) return <Skeleton className="h-24 w-full" aria-busy="true" />;
  if (items.length === 0 && !paging.hasPrevious) {
    return (
      <EmptyState
        icon={<domainIcons.violation aria-hidden="true" />}
        title={t("disciplineEmpty")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface px-4">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={studentProfileHref(item.student_user_id, "discipline")}
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
      <CursorPagination
        hasPrevious={paging.hasPrevious}
        hasNext={paging.hasNextFor(items.length)}
        onPrevious={paging.goPrevious}
        onNext={paging.goNext}
      />
    </div>
  );
}

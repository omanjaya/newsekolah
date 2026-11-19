"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Badge, EmptyState, List, ListRow, SkeletonList, domainIcons } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { CursorPagination } from "../../../components/cursor-pagination";
import { QueryError } from "../../../components/query-error";
import { useOffsetPage } from "../../../lib/hooks/use-offset-page";
import { useViolationsQuery } from "../../discipline/api";
import { useDirectoryNames } from "../../reference/directory-names";
import { studentProfileHref } from "../../students/href";

/** Rows per page; the violations API pages by offset and reports no total. */
const PAGE_SIZE = 50;

/** Violation records of one homeroom class, as the API orders them. */
export function HomeroomDisciplineTab({ classId }: { classId: string }): ReactElement {
  const t = useTranslations("app.homeroom");
  const locale = useLocale() as Locale;
  const paging = useOffsetPage(PAGE_SIZE, "discipline_page");
  const { data, isLoading, isError, error, refetch } = useViolationsQuery(
    { classId, from: "", to: "", includeVoided: false },
    { limit: paging.limit, offset: paging.offset },
  );
  const items = data?.data ?? [];
  const studentMap = useDirectoryNames(items.map((item) => item.student_user_id));

  if (isLoading) return <SkeletonList rows={4} />;
  // A failed read is not a clean record (audit r3-n18).
  if (isError) return <QueryError retry={() => refetch()} error={error} />;
  if (items.length === 0 && !paging.hasPrevious) {
    return (
      <EmptyState
        icon={<domainIcons.violation aria-hidden="true" />}
        title={t("disciplineEmpty")}
        description={t("disciplineEmptyBody")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <List framed>
        {items.map((item) => (
          <ListRow
            key={item.id}
            title={studentMap.get(item.student_user_id)?.name ?? t("unknownStudent")}
            meta={`${item.type_name} · ${formatDate(item.occurred_on, { locale })}`}
            trailing={
              <Badge tone="warning" size="sm">
                {t("pointsBadge", { points: item.points })}
              </Badge>
            }
            href={studentProfileHref(item.student_user_id, "discipline")}
          />
        ))}
      </List>
      <CursorPagination
        hasPrevious={paging.hasPrevious}
        hasNext={paging.hasNextFor(items.length)}
        onPrevious={paging.goPrevious}
        onNext={paging.goNext}
      />
    </div>
  );
}

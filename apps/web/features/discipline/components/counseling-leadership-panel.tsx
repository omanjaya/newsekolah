"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useOffsetPage } from "../../../lib/hooks/use-offset-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useLeadershipCounselingsQuery } from "../api-counseling-extras";

import { CounselingSharedTable } from "./counseling-shared-table";

/** Rows per page; the counseling API pages by offset and reports no total. */
const PAGE_SIZE = 50;

/**
 * Notes a counselor shared with school leadership (visibility
 * "leadership"), for the principal and the leadership duty: the list the
 * "Pimpinan" option in the note form promises them.
 */
export function CounselingLeadershipPanel({
  onOpen,
}: {
  onOpen: (id: string) => void;
}): ReactElement {
  const t = useTranslations("app.discipline.counseling");
  const [search, setSearch] = useUrlState<string>("leaders_q", () => true, "");
  const paging = useOffsetPage(PAGE_SIZE, "leaders_page");
  const { data, isLoading, error, refetch } = useLeadershipCounselingsQuery({
    limit: paging.limit,
    offset: paging.offset,
    search,
  });

  return (
    <CounselingSharedTable
      stateKey="features/discipline/components/counseling-leadership-panel:1"
      items={data?.data ?? []}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      paging={paging}
      search={search}
      onSearchChange={setSearch}
      emptyTitle={t("leadership.emptyTitle")}
      emptyBody={t("leadership.emptyBody")}
      onOpen={onOpen}
    />
  );
}

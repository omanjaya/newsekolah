"use client";

import { type DataTableFilterDef } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useOffsetPage } from "../../../lib/hooks/use-offset-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { type CounselingTopic } from "../api";
import { useBKTeamCounselingsQuery } from "../api-counseling-extras";

import { CounselingSharedTable } from "./counseling-shared-table";

/** Rows per page; the counseling API pages by offset and reports no total. */
const PAGE_SIZE = 50;
const TOPICS: CounselingTopic[] = ["career", "problem", "personal", "learning", "social", "other"];
const TOPIC_VALUES = ["", ...TOPICS] as const;

/**
 * Notes shared with the whole BK team (visibility "bk_team"), for a
 * counselor to see what colleagues are handling. The API answers only a
 * duty counselor (403 COUNSELING_FORBIDDEN for anyone else), so the
 * counseling page mounts this panel for duty counselors alone.
 */
export function CounselingBKTeamPanel({ onOpen }: { onOpen: (id: string) => void }): ReactElement {
  const t = useTranslations("app.discipline.counseling");
  const [topic, setTopic] = useUrlState<(typeof TOPIC_VALUES)[number]>("topic", TOPIC_VALUES, "");

  const [search, setSearch] = useUrlState<string>("team_q", () => true, "");
  const paging = useOffsetPage(PAGE_SIZE, "team_page");
  const { data, isLoading, error, refetch } = useBKTeamCounselingsQuery(topic, {
    limit: paging.limit,
    offset: paging.offset,
    search,
  });

  const filters: DataTableFilterDef[] = [
    {
      id: "topic",
      label: t("bkTeam.topicFilter"),
      value: topic,
      onChange: (value) => {
        setTopic(value as (typeof TOPIC_VALUES)[number]);
        paging.resetPage();
      },
      options: TOPICS.map((topicOption) => ({
        value: topicOption,
        label: t(`form.topicOptions.${topicOption}`),
      })),
    },
  ];

  return (
    <CounselingSharedTable
      stateKey="features/discipline/components/counseling-bk-team-panel:1"
      items={data?.data ?? []}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      paging={paging}
      search={search}
      onSearchChange={setSearch}
      filters={filters}
      emptyTitle={t("bkTeam.emptyTitle")}
      emptyBody={t("bkTeam.emptyBody")}
      onOpen={onOpen}
    />
  );
}

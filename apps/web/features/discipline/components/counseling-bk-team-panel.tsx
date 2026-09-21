"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Avatar, DataTable, EmptyState, Select, domainIcons } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useDirectoryQuery, useLookup } from "../../reference/api";
import { type Counseling, type CounselingTopic, useBKTeamCounselingsQuery } from "../api";

const TOPICS: CounselingTopic[] = ["career", "problem", "personal", "learning", "social", "other"];

/**
 * Notes shared with the whole BK team (visibility "bk_team"), for a
 * counselor to see what colleagues are handling. The API further requires
 * the caller to be a duty counselor; a caller who is not sees an empty
 * list rather than an error, so the empty state stays honest either way.
 */
export function CounselingBKTeamPanel({ onOpen }: { onOpen: (id: string) => void }): ReactElement {
  const t = useTranslations("app.discipline.counseling");
  const locale = useLocale() as Locale;
  const [topic, setTopic] = useState<CounselingTopic | "">("");

  const { data, isLoading } = useBKTeamCounselingsQuery(topic);
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);

  const items = data?.data ?? [];
  const topicOptions = [
    { value: "all", label: t("bkTeam.topicAll") },
    ...TOPICS.map((topicOption) => ({
      value: topicOption,
      label: t(`form.topicOptions.${topicOption}`),
    })),
  ];

  const columns = useMemo<ColumnDef<Counseling>[]>(
    () => [
      { accessorKey: "title", header: t("columns.title"), enableSorting: false },
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        cell: ({ row }) => {
          const student = studentMap.get(row.original.student_user_id);
          return student ? (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar size="sm" name={student.name} />
              <span className="truncate">{student.name}</span>
            </div>
          ) : (
            t("unknownStudent")
          );
        },
      },
      {
        id: "date",
        header: t("columns.date"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.session_at, { locale }),
      },
      {
        id: "topic",
        header: t("columns.topic"),
        enableSorting: false,
        cell: ({ row }) => t(`form.topicOptions.${row.original.topic}`),
      },
    ],
    [t, locale, studentMap],
  );

  return (
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("bkTeam.topicFilter")}</span>
        <Select
          options={topicOptions}
          value={topic || "all"}
          onValueChange={(v) => {
            setTopic(v === "all" ? "" : (v as CounselingTopic));
          }}
          className="w-52"
          aria-label={t("bkTeam.topicFilter")}
        />
      </label>
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/discipline/components/counseling-bk-team-panel:1"
          mode="local"
          data={items}
          columns={columns}
          rowCount={items.length}
          pagination={{ pageIndex: 0, pageSize: 50 }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter=""
          isLoading={isLoading}
          getRowId={(item) => item.id}
          onRowActivate={(item) => {
            onOpen(item.id);
          }}
          fillHeight
          emptyState={
            <EmptyState
              icon={<domainIcons.users aria-hidden="true" />}
              title={t("bkTeam.emptyTitle")}
              description={t("bkTeam.emptyBody")}
            />
          }
        />
      </div>
    </div>
  );
}

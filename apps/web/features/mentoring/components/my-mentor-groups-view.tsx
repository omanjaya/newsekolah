"use client";

import { DataTable, EmptyState, PageHeader, domainIcons } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { type MentorGroup, useMyMentorGroupsQuery } from "../api";

/** The mentor groups the signed-in guru wali leads, one row per group. */
export function MyMentorGroupsView(): ReactElement {
  const t = useTranslations("app.mentoring.myGroups");
  const router = useRouter();

  const { data, isLoading } = useMyMentorGroupsQuery();
  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<MentorGroup>[]>(
    () => [{ accessorKey: "name", header: t("columns.name"), enableSorting: false }],
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <DataTable
        stateKey="features/mentoring/components/my-mentor-groups-view:1"
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
          router.push(`/mentoring/groups/${item.id}`);
        }}
        emptyState={
          <EmptyState
            icon={<domainIcons.mentoring aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />
    </div>
  );
}

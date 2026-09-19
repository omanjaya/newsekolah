"use client";

import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  domainIcons,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useCan } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import {
  type LibraryTitle,
  downloadLibraryCatalogueExportXlsx,
  useLibraryTitlesQuery,
} from "../api";

import { TitleForm } from "./title-form";

export function CatalogueView(): ReactElement {
  const t = useTranslations("app.library.catalogue");
  const canManage = useCan("manage_library_catalog");
  const [search, setSearch] = useRememberedViewState("catalogue-search", "");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<LibraryTitle | null>(null);
  const { data, isLoading } = useLibraryTitlesQuery(search);
  const titles = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryTitle>[]>(
    () => [
      { accessorKey: "title", header: t("columns.title"), enableSorting: false },
      { accessorKey: "author", header: t("columns.author"), enableSorting: false },
      {
        accessorKey: "classification",
        header: t("columns.classification"),
        enableSorting: false,
        cell: ({ row }) => row.original.classification || "-",
      },
      {
        id: "copies",
        header: t("columns.copies"),
        enableSorting: false,
        cell: ({ row }) =>
          t("copiesAvailable", {
            available: row.original.available_copies,
            total: row.original.total_copies,
          }),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Link
              href={`/library/catalogue/${row.original.id}`}
              className="text-[13px] font-medium text-accent hover:underline"
            >
              {t("viewCopies")}
            </Link>
            {canManage && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(row.original);
                }}
              >
                {t("editTitle")}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, canManage],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button asChild size="sm" variant="secondary">
          <Link href="/library/copies">{t("browseCopies")}</Link>
        </Button>
        {canManage && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void downloadLibraryCatalogueExportXlsx();
            }}
          >
            {t("exportCatalogue")}
          </Button>
        )}
        {canManage && (
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setAdding(true);
            }}
          >
            {t("addTitle")}
          </Button>
        )}
      </div>

      <DataTable
        stateKey="features/library/components/catalogue-view:1"
        data={titles}
        columns={columns}
        rowCount={titles.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
        isLoading={isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.library aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <Dialog
        open={adding || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent title={editing ? t("editTitle") : t("addTitle")}>
          {(adding || editing) && (
            <TitleForm
              key={editing?.id ?? "new"}
              initial={editing ?? undefined}
              onDone={() => {
                setAdding(false);
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

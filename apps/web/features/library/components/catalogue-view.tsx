"use client";

import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  RowActionsMenu,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useCan } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import {
  type LibraryTitle,
  downloadLibraryCatalogueExportXlsx,
  useDeleteLibraryTitleMutation,
  useLibraryTitlesQuery,
} from "../api";
import { useLibraryErrorMessage } from "../use-library-error-message";

import { TitleForm } from "./title-form";

export function CatalogueView(): ReactElement {
  const t = useTranslations("app.library.catalogue");
  const toast = useToast();
  const libraryErrorMessage = useLibraryErrorMessage();
  const canManage = useCan("manage_library_catalog");
  const [search, setSearch] = useRememberedViewState("catalogue-search", "");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<LibraryTitle | null>(null);
  const [deleting, setDeleting] = useState<LibraryTitle | null>(null);
  const { data, isLoading } = useLibraryTitlesQuery(search);
  const deleteTitle = useDeleteLibraryTitleMutation();
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
        cell: ({ row }) => (
          <Badge
            variant={row.original.available_copies > 0 ? "accent" : "neutral"}
            className={
              row.original.available_copies === 0 ? "border-status-late/40 text-status-late" : ""
            }
          >
            {t("copiesAvailable", {
              available: row.original.available_copies,
              total: row.original.total_copies,
            })}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button asChild size="sm" variant="secondary">
              <Link href={`/library/catalogue/${row.original.id}`}>
                <BookOpen aria-hidden="true" />
                {t("viewCopies")}
              </Link>
            </Button>
            {canManage && (
              <TitleRowActionsMenu
                title={row.original.title}
                onEdit={() => {
                  setEditing(row.original);
                }}
                onDelete={() => {
                  setDeleting(row.original);
                }}
              />
            )}
          </div>
        ),
      },
    ],
    [t, canManage],
  );

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the table scrolls its rows internally while the
    // action row stays put. See school/users-view.tsx for the reference
    // pattern.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
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

      <div className="flex flex-col md:min-h-0 md:flex-1">
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
          fillHeight
          emptyState={
            <EmptyState
              icon={<domainIcons.library aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
            />
          }
        />
      </div>

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

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("deleteTitle")}
        description={deleting ? t("deleteBody", { title: deleting.title }) : ""}
        confirmLabel={t("deleteConfirm")}
        destructive
        confirming={deleteTitle.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteTitle.mutateAsync(deleting.id);
            toast.success(t("deleted"));
            setDeleting(null);
          } catch (error) {
            toast.error(libraryErrorMessage(error));
            setDeleting(null);
          }
        }}
      />
    </div>
  );
}

/**
 * A title row's edit/delete collapsed behind one "..." button instead of
 * two bare icon buttons next to "Lihat eksemplar" (docs/07-ui-ux.md:
 * secondary actions in a labelled "..." menu, never bare icons).
 */
function TitleRowActionsMenu({
  title,
  onEdit,
  onDelete,
}: {
  title: string;
  onEdit: () => void;
  onDelete: () => void;
}): ReactElement {
  const t = useTranslations("app.library.catalogue");

  return (
    <RowActionsMenu
      ariaLabel={t("rowActions", { title })}
      items={[
        {
          label: t("editTitle"),
          icon: <Pencil className="size-4" aria-hidden="true" />,
          onClick: onEdit,
        },
        {
          label: t("deleteTitle"),
          icon: <Trash2 className="size-4" aria-hidden="true" />,
          tone: "danger",
          onClick: onDelete,
        },
      ]}
    />
  );
}

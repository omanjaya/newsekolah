"use client";

import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  PageHeader,
  RowActionsMenu,
  domainIcons,
  useToast,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { BookOpen, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import {
  type LibraryTitle,
  downloadLibraryCatalogueExportXlsx,
  useDeleteLibraryTitleMutation,
  useLibraryTitlesQuery,
} from "../api";
import { useLibraryCatalogueOptionsQuery } from "../master-data-api";
import { useLibraryErrorMessage } from "../use-library-error-message";

import { TitleForm } from "./title-form";

const AVAILABILITY_VALUES = ["", "available"] as const;
const SORT_VALUES = ["", "newest"] as const;

export function CatalogueView(): ReactElement {
  const t = useTranslations("app.library.catalogue");
  const tWorkspace = useTranslations("app.library.workspace");
  const toast = useToast();
  const libraryErrorMessage = useLibraryErrorMessage();
  const canManage = useCan("manage_library_catalog");
  const canView = useCan("view_library");
  const canReport = useCan("view_library_reports");
  const [search, setSearch] = useRememberedViewState("catalogue-search", "");
  const [materialTypeId, setMaterialTypeId] = useUrlState<string>("material_type", () => true, "");
  const [ddcClass, setDdcClass] = useUrlState<string>("ddc_class", () => true, "");
  const [availability, setAvailability] = useUrlState<(typeof AVAILABILITY_VALUES)[number]>(
    "availability",
    AVAILABILITY_VALUES,
    "",
  );
  const [sort, setSort] = useUrlState<(typeof SORT_VALUES)[number]>("sort", SORT_VALUES, "");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<LibraryTitle | null>(null);
  const [deleting, setDeleting] = useState<LibraryTitle | null>(null);
  const { data, isLoading } = useLibraryTitlesQuery({
    search,
    materialTypeId,
    ddcClass,
    availability,
    sort,
  });
  const catalogueOptions = useLibraryCatalogueOptionsQuery();
  const deleteTitle = useDeleteLibraryTitleMutation();
  const titles = data?.data ?? [];

  const materialTypeOptions = (catalogueOptions.data?.material_types ?? []).map((type) => ({
    value: type.id,
    label: type.name,
  }));
  const ddcOptions = (catalogueOptions.data?.ddc_classes ?? []).map((ddc) => ({
    value: ddc.code,
    label: `${ddc.code} — ${ddc.name}`,
  }));

  // The table always shows the catalogue's first page (`pagination` below
  // is a fixed `{ pageIndex: 0, ... }`, not wired to a real offset
  // control), so a filter change already lands on page one without an
  // explicit reset -- there is no further-along page state to clear.
  const filters: DataTableFilterDef[] = [
    {
      id: "materialType",
      label: t("filters.materialType"),
      value: materialTypeId,
      onChange: setMaterialTypeId,
      options: materialTypeOptions,
    },
    {
      id: "classification",
      label: t("filters.classification"),
      value: ddcClass,
      onChange: setDdcClass,
      options: ddcOptions,
    },
    {
      id: "availability",
      label: t("filters.availability"),
      value: availability,
      onChange: (value) => {
        setAvailability(value as (typeof AVAILABILITY_VALUES)[number]);
      },
      type: "boolean",
      activeValue: "available",
    },
    {
      id: "sort",
      label: t("filters.sort"),
      value: sort,
      onChange: (value) => {
        setSort(value as (typeof SORT_VALUES)[number]);
      },
      options: [
        { value: "", label: t("filters.sortTitle") },
        { value: "newest", label: t("filters.sortNewest") },
      ],
    },
  ];

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label={tWorkspace("catalogue")}
          className="inline-flex w-fit items-center gap-1 rounded-full bg-bg p-1"
        >
          <Link
            href="/library/catalogue"
            aria-current="page"
            className="flex h-11 items-center justify-center rounded-full bg-surface px-4 text-[13px] font-medium text-fg shadow-(--shadow-card) md:h-8"
          >
            {tWorkspace("titles")}
          </Link>
          <Link
            href="/library/copies"
            className="flex h-11 items-center justify-center rounded-full px-4 text-[13px] font-medium text-fg-muted hover:text-fg md:h-8"
          >
            {tWorkspace("copies")}
          </Link>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
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
          {(canManage || canView || canReport) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary">
                  {t("more")}
                  <ChevronDown aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canManage && (
                  <DropdownMenuItem asChild>
                    <Link href="/library/import">{tWorkspace("importBooks")}</Link>
                  </DropdownMenuItem>
                )}
                {canView && (
                  <DropdownMenuItem asChild>
                    <Link href="/library/master-data">{tWorkspace("catalogueSettings")}</Link>
                  </DropdownMenuItem>
                )}
                {canReport && (
                  <DropdownMenuItem asChild>
                    <Link href="/library/reports?tab=accessionRegister">
                      {tWorkspace("report")}
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
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
          filters={filters}
          filtersLabels={{
            reset: t("filters.reset"),
            removeFilter: (label) => t("filters.removeFilter", { label }),
          }}
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

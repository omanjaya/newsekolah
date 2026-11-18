"use client";

import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  FilteredEmptyState,
  RowActionsMenu,
  domainIcons,
  useToast,
  type DataTableFilterDef,
  type PageHeaderAction,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useOffsetPage } from "../../../lib/hooks/use-offset-page";
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

import { LibraryWorkspaceNav, useLibraryShortcuts } from "./library-workspace-nav";
import { TitleForm } from "./title-form";

const AVAILABILITY_VALUES = ["", "available"] as const;
const SORT_VALUES = ["", "newest"] as const;

/** Rows per page; the titles API pages by offset and reports no total. */
const TITLES_PAGE_SIZE = 50;

export function CatalogueView(): ReactElement {
  const t = useTranslations("app.library.catalogue");
  const router = useRouter();
  const toast = useToast();
  const libraryErrorMessage = useLibraryErrorMessage();
  const canManage = useCan("manage_library_catalog");
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
  const paging = useOffsetPage(TITLES_PAGE_SIZE);
  const { data, isLoading, error, refetch, isRefetching } = useLibraryTitlesQuery({
    limit: paging.limit,
    offset: paging.offset,
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

  const filters: DataTableFilterDef[] = [
    {
      id: "materialType",
      label: t("filters.materialType"),
      value: materialTypeId,
      onChange: paging.resetting(setMaterialTypeId),
      options: materialTypeOptions,
    },
    {
      id: "classification",
      label: t("filters.classification"),
      value: ddcClass,
      onChange: paging.resetting(setDdcClass),
      options: ddcOptions,
    },
    {
      id: "availability",
      label: t("filters.availability"),
      value: availability,
      onChange: (value) => {
        setAvailability(value as (typeof AVAILABILITY_VALUES)[number]);
        paging.resetPage();
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
        paging.resetPage();
      },
      options: [
        { value: "", label: t("filters.sortTitle") },
        { value: "newest", label: t("filters.sortNewest") },
      ],
    },
  ];

  const columns = useMemo<ColumnDef<LibraryTitle>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("columns.title"),
        enableSorting: false,
        meta: { card: "title" },
        // Body text, as in the other areas' tables: the row opens the title.
        cell: ({ row }) => <span className="font-semibold text-fg">{row.original.title}</span>,
      },
      {
        accessorKey: "author",
        header: t("columns.author"),
        enableSorting: false,
        meta: { card: "subtitle" },
        // A missing author is a dash in the table; the phone card leaves
        // the line out rather than show a bare dash under the title.
        cell: ({ row }) => row.original.author || <span className="max-md:hidden">-</span>,
      },
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
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => (
          <Badge
            tone={
              row.original.total_copies === 0
                ? "neutral"
                : row.original.available_copies > 0
                  ? "success"
                  : "warning"
            }
          >
            {t("copiesAvailable", {
              available: row.original.available_copies,
              total: row.original.total_copies,
            })}
          </Badge>
        ),
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: t("columns.actions"),
              enableSorting: false,
              cell: ({ row }: { row: { original: LibraryTitle } }) => (
                <TitleRowActionsMenu
                  title={row.original.title}
                  onEdit={() => {
                    setEditing(row.original);
                  }}
                  onDelete={() => {
                    setDeleting(row.original);
                  }}
                />
              ),
            } satisfies ColumnDef<LibraryTitle>,
          ]
        : []),
    ],
    [t, canManage],
  );

  const shortcuts = useLibraryShortcuts(["catalogueSettings", { report: "accessionRegister" }]);
  const secondaryActions: PageHeaderAction[] = [
    ...(canManage
      ? [
          {
            label: t("exportCatalogue"),
            icon: <Download />,
            onSelect: () => {
              void downloadLibraryCatalogueExportXlsx();
            },
          },
        ]
      : []),
    ...shortcuts,
  ];
  const filtered = search !== "" || materialTypeId !== "" || ddcClass !== "" || availability !== "";

  return (
    // Viewport-fit on desktop: the page itself never scrolls; the table
    // scrolls its rows internally. Eyebrow and title come from the
    // navigation registry. The tabs are the catalogue area's own strip,
    // the one the copies, import and stocktake pages show: import is one
    // of its tabs, and catalogue settings and the report sit at its end.
    <AppPage
      variant="fit"
      nav={<LibraryWorkspaceNav area="catalogue" />}
      primaryAction={
        canManage ? (
          <Button
            icon={<Plus />}
            onClick={() => {
              setAdding(true);
            }}
          >
            {t("addTitle")}
          </Button>
        ) : undefined
      }
      primaryActionCompact={
        canManage
          ? {
              icon: <Plus />,
              label: t("addTitle"),
              onSelect: () => {
                setAdding(true);
              },
            }
          : undefined
      }
      secondaryActions={secondaryActions}
    >
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/library/components/catalogue-view:1"
          data={titles}
          mode="cursor"
          columns={columns}
          rowCount={titles.length}
          cursorPagination={{
            hasPrevious: paging.hasPrevious,
            hasNext: paging.hasNextFor(titles.length),
            onPrevious: paging.goPrevious,
            onNext: paging.goNext,
            page: paging.page,
            pageSize: paging.limit,
          }}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter={search}
          onGlobalFilterChange={paging.resetting(setSearch)}
          toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
          filters={filters}
          filtersLabels={{
            reset: t("filters.reset"),
            removeFilter: (label) => t("filters.removeFilter", { label }),
          }}
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          retrying={isRefetching}
          getRowId={(item) => item.id}
          onRowActivate={(item) => {
            router.push(`/library/catalogue/${item.id}`);
          }}
          fillHeight
          emptyState={
            filtered ? (
              <FilteredEmptyState
                onReset={() => {
                  setSearch("");
                  setMaterialTypeId("");
                  setDdcClass("");
                  setAvailability("");
                  paging.resetPage();
                }}
              />
            ) : (
              <EmptyState
                icon={<domainIcons.library aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
                action={
                  canManage ? (
                    <Button
                      variant="secondary"
                      icon={<Plus />}
                      onClick={() => {
                        setAdding(true);
                      }}
                    >
                      {t("addTitle")}
                    </Button>
                  ) : undefined
                }
              />
            )
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
        <DialogContent title={editing ? t("editTitle") : t("addTitle")} size="lg">
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
    </AppPage>
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

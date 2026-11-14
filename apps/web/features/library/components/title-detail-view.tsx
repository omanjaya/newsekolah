"use client";

import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  RowActionsMenu,
  SkeletonDetail,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  domainIcons,
  selectionColumn,
  type PageHeaderAction,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { BookOpenCheck, Eye, Layers, Pencil, Plus, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import {
  type LibraryCopy,
  printCopyLabel,
  useLibraryCopiesQuery,
  useLibraryTitleQuery,
  useReservationQueueQuery,
} from "../api";
import { COPY_STATUS_TONE, toneOf } from "../lib/status-tones";
import { useOrderedSelection } from "../use-ordered-selection";

import { CopiesBatchForm } from "./copies-batch-form";
import { CopyDetailSheet } from "./copy-detail-sheet";
import { CopyForm } from "./copy-form";
import { CopyLabelPrintAction } from "./copy-label-print-bar";
import { ReadInPlaceDialog } from "./read-in-place-dialog";
import { BibliographicRecord, ReservationQueue, TitleIdentity } from "./title-detail-sections";
import { TitleForm } from "./title-form";

const TABS = ["copies", "reservations", "details"] as const;
type TitleTab = (typeof TABS)[number];

/**
 * A title's own page (docs/07-ui-ux.md "Detail"): the book's identity
 * (stand-in cover, title, author, publication, availability) under a
 * breadcrumb back to the catalogue, then its copies, the reservation queue
 * and the bibliographic record as tabs. Adding a copy leads the header;
 * editing the record and adding copies in bulk sit beside it.
 */
export function TitleDetailView({ titleId }: { titleId: string }): ReactElement {
  const t = useTranslations("app.library.titleDetail");
  const tCopies = useTranslations("app.library.copies");
  const tCatalogue = useTranslations("app.library.catalogue");
  const canManage = useCan("manage_library_catalog");
  const title = useLibraryTitleQuery(titleId);
  const copiesQuery = useLibraryCopiesQuery(titleId);
  const queue = useReservationQueueQuery(titleId);
  const [tab, setTab] = useUrlState<TitleTab>("tab", TABS, "copies");
  const [adding, setAdding] = useState(false);
  const [addingBatch, setAddingBatch] = useState(false);
  const [editing, setEditing] = useState(false);
  const [readingInPlace, setReadingInPlace] = useState<string | null>(null);
  const [viewingCopyId, setViewingCopyId] = useState<string | null>(null);
  const { selection, onSelectionChange, orderedIds } = useOrderedSelection();
  const copies = useMemo(() => copiesQuery.data?.data ?? [], [copiesQuery.data]);
  const reservations = queue.data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryCopy>[]>(
    () => [
      ...(canManage ? [selectionColumn<LibraryCopy>()] : []),
      {
        accessorKey: "barcode",
        header: tCopies("columns.barcode"),
        enableSorting: false,
        meta: { card: "title" },
        cell: ({ row }) => (
          <Button
            variant="link"
            className="font-semibold tabular-nums"
            onClick={() => {
              setViewingCopyId(row.original.id);
            }}
          >
            {row.original.barcode}
          </Button>
        ),
      },
      {
        accessorKey: "condition",
        header: tCopies("columns.condition"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) => tCopies(`condition.${row.original.condition}`),
      },
      {
        accessorKey: "status",
        header: tCopies("columns.status"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => (
          <Badge tone={toneOf(COPY_STATUS_TONE, row.original.status)}>
            {tCopies(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: tCopies("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <RowActionsMenu
            ariaLabel={tCopies("rowActions", { barcode: row.original.barcode })}
            items={[
              {
                label: tCopies("viewDetail"),
                icon: <Eye className="size-4" aria-hidden="true" />,
                onClick: () => {
                  setViewingCopyId(row.original.id);
                },
              },
              ...(canManage
                ? [
                    {
                      label: tCopies("printLabel"),
                      icon: <Printer className="size-4" aria-hidden="true" />,
                      onClick: () => {
                        void printCopyLabel(row.original.id);
                      },
                    },
                  ]
                : []),
              {
                label: tCopies("readInPlace"),
                icon: <BookOpenCheck className="size-4" aria-hidden="true" />,
                onClick: () => {
                  setReadingInPlace(row.original.id);
                },
              },
            ]}
          />
        ),
      },
    ],
    [tCopies, canManage],
  );

  const data = title.data;
  const secondaryActions: PageHeaderAction[] = canManage
    ? [
        {
          label: tCatalogue("editTitle"),
          icon: <Pencil />,
          onSelect: () => {
            setEditing(true);
          },
        },
        {
          label: tCopies("addCopiesBatch"),
          icon: <Layers />,
          onSelect: () => {
            setAddingBatch(true);
          },
        },
      ]
    : [];

  if (title.isLoading || (!data && !title.isError)) {
    return (
      <AppPage title={tCatalogue("title")} breadcrumb={false} nav={false} header={false}>
        <SkeletonDetail />
      </AppPage>
    );
  }
  if (!data) {
    return (
      <AppPage title={t("notFoundTitle")} nav={false}>
        <QueryError retry={() => title.refetch()} error={title.error} />
      </AppPage>
    );
  }

  return (
    <AppPage
      title={data.title}
      description={data.subtitle}
      nav={false}
      primaryAction={
        canManage ? (
          <Button
            icon={<Plus />}
            onClick={() => {
              setAdding(true);
            }}
          >
            {tCopies("addCopy")}
          </Button>
        ) : undefined
      }
      secondaryActions={secondaryActions}
    >
      <TitleIdentity title={data} />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as TitleTab);
        }}
      >
        <TabsList variant="underline" aria-label={t("tabsLabel")}>
          <TabsTrigger value="copies" count={copies.length}>
            {t("tabs.copies")}
          </TabsTrigger>
          <TabsTrigger value="reservations" count={reservations.length || undefined}>
            {t("tabs.reservations")}
          </TabsTrigger>
          <TabsTrigger value="details">{t("tabs.details")}</TabsTrigger>
        </TabsList>

        <TabsContent value="copies">
          <DataTable
            stateKey="features/library/components/title-detail-view:copies"
            mode="local"
            data={copies}
            columns={columns}
            isLoading={copiesQuery.isLoading}
            error={copiesQuery.error}
            onRetry={() => void copiesQuery.refetch()}
            rowSelection={selection}
            onRowSelectionChange={onSelectionChange}
            bulkActions={canManage ? <CopyLabelPrintAction selectedIds={orderedIds} /> : undefined}
            getRowId={(item) => item.id}
            searchable={copies.length > 10}
            emptyState={
              <EmptyState
                icon={<domainIcons.library aria-hidden="true" />}
                title={tCopies("emptyTitle")}
                description={tCopies("emptyBody")}
                action={
                  canManage ? (
                    <Button
                      icon={<Plus />}
                      onClick={() => {
                        setAdding(true);
                      }}
                    >
                      {tCopies("addCopy")}
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </TabsContent>

        <TabsContent value="reservations">
          <ReservationQueue
            isLoading={queue.isLoading}
            error={queue.error}
            onRetry={() => void queue.refetch()}
            reservations={reservations}
          />
        </TabsContent>

        <TabsContent value="details">
          <BibliographicRecord title={data} />
        </TabsContent>
      </Tabs>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title={tCopies("addCopy")} size="md">
          {adding && (
            <CopyForm
              titleId={titleId}
              onDone={() => {
                setAdding(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addingBatch} onOpenChange={setAddingBatch}>
        <DialogContent title={tCopies("addCopiesBatch")} size="md">
          {addingBatch && (
            <CopiesBatchForm
              titleId={titleId}
              onDone={() => {
                setAddingBatch(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={tCatalogue("editTitle")} size="lg">
          {editing && (
            <TitleForm
              initial={data}
              onDone={() => {
                setEditing(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ReadInPlaceDialog
        copyId={readingInPlace}
        onOpenChange={(open) => {
          if (!open) setReadingInPlace(null);
        }}
      />

      <CopyDetailSheet
        copy={copies.find((copy) => copy.id === viewingCopyId) ?? null}
        canManage={canManage}
        onOpenChange={(open) => {
          if (!open) setViewingCopyId(null);
        }}
        onDeleted={() => {
          setViewingCopyId(null);
        }}
      />
    </AppPage>
  );
}

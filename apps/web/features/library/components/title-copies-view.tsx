"use client";

import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  RowActionsMenu,
  domainIcons,
  selectionColumn,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { BookOpenCheck, Layers, Plus, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useCan } from "../../../lib/session/session-provider";
import {
  type LibraryCopy,
  printCopyLabel,
  useLibraryCopiesQuery,
  useLibraryTitleQuery,
} from "../api";
import { useOrderedSelection } from "../use-ordered-selection";

import { CopiesBatchForm } from "./copies-batch-form";
import { CopyDetailSheet } from "./copy-detail-sheet";
import { CopyForm } from "./copy-form";
import { CopyLabelPrintBar } from "./copy-label-print-bar";
import { ReadInPlaceDialog } from "./read-in-place-dialog";

export function TitleCopiesView({ titleId }: { titleId: string }): ReactElement {
  const t = useTranslations("app.library.copies");
  const tCatalogue = useTranslations("app.library.catalogue");
  const canManage = useCan("manage_library_catalog");
  const title = useLibraryTitleQuery(titleId);
  const { data, isLoading } = useLibraryCopiesQuery(titleId);
  const [adding, setAdding] = useState(false);
  const [addingBatch, setAddingBatch] = useState(false);
  const [readingInPlace, setReadingInPlace] = useState<string | null>(null);
  const [viewingCopyId, setViewingCopyId] = useState<string | null>(null);
  const { selection, onSelectionChange, orderedIds, clear } = useOrderedSelection();
  const copies = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryCopy>[]>(
    () => [
      ...(canManage ? [selectionColumn<LibraryCopy>()] : []),
      { accessorKey: "barcode", header: t("columns.barcode"), enableSorting: false },
      {
        accessorKey: "condition",
        header: t("columns.condition"),
        enableSorting: false,
        cell: ({ row }) => t(`condition.${row.original.condition}`),
      },
      {
        accessorKey: "status",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "available" ? "accent" : "neutral"}>
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setViewingCopyId(row.original.id);
              }}
            >
              {t("viewDetail")}
            </Button>
            <CopyRowActionsMenu
              barcode={row.original.barcode}
              canManage={canManage}
              onPrintLabel={() => {
                void printCopyLabel(row.original.id);
              }}
              onReadInPlace={() => {
                setReadingInPlace(row.original.id);
              }}
            />
          </div>
        ),
      },
    ],
    [t, canManage],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        breadcrumb={[
          { label: tCatalogue("title"), href: "/library/catalogue" },
          { label: title.data?.title ?? "" },
        ]}
        title={t("title")}
        actions={
          canManage ? (
            <>
              <Button
                variant="secondary"
                icon={<Layers />}
                onClick={() => {
                  setAddingBatch(true);
                }}
              >
                {t("addCopiesBatch")}
              </Button>
              <Button
                icon={<Plus />}
                onClick={() => {
                  setAdding(true);
                }}
              >
                {t("addCopy")}
              </Button>
            </>
          ) : undefined
        }
      />

      <CopyLabelPrintBar selectedIds={orderedIds} onClear={clear} />

      <DataTable
        stateKey="features/library/components/title-copies-view:1"
        mode="local"
        data={copies}
        columns={columns}
        rowCount={copies.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        isLoading={isLoading}
        rowSelection={selection}
        onRowSelectionChange={onSelectionChange}
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
        open={adding}
        onOpenChange={(open) => {
          setAdding(open);
        }}
      >
        <DialogContent title={t("addCopy")}>
          <CopyForm
            titleId={titleId}
            onDone={() => {
              setAdding(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={addingBatch}
        onOpenChange={(open) => {
          setAddingBatch(open);
        }}
      >
        <DialogContent title={t("addCopiesBatch")}>
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
    </div>
  );
}

/**
 * A copy row's secondary actions ("Cetak label", "Baca di tempat")
 * collapsed behind one "..." button instead of two extra buttons next to
 * "Lihat detail" on every row (docs/07-ui-ux.md: secondary actions in a
 * labelled "..." menu, never bare icons).
 */
function CopyRowActionsMenu({
  barcode,
  canManage,
  onPrintLabel,
  onReadInPlace,
}: {
  barcode: string;
  canManage: boolean;
  onPrintLabel: () => void;
  onReadInPlace: () => void;
}): ReactElement {
  const t = useTranslations("app.library.copies");

  return (
    <RowActionsMenu
      ariaLabel={t("rowActions", { barcode })}
      items={[
        ...(canManage
          ? [
              {
                label: t("printLabel"),
                icon: <Printer className="size-4" aria-hidden="true" />,
                onClick: onPrintLabel,
              },
            ]
          : []),
        {
          label: t("readInPlace"),
          icon: <BookOpenCheck className="size-4" aria-hidden="true" />,
          onClick: onReadInPlace,
        },
      ]}
    />
  );
}

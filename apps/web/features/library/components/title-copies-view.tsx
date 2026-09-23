"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  PageHeader,
  Select,
  domainIcons,
  selectionColumn,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Layers, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type LibraryCopy,
  type LibraryCopyWrite,
  printCopyLabel,
  useCreateLibraryCopyMutation,
  useLibraryCopiesQuery,
  useLibraryTitleQuery,
} from "../api";
import { useLibraryCatalogueOptionsQuery } from "../master-data-api";
import { useOrderedSelection } from "../use-ordered-selection";

import { CopiesBatchForm } from "./copies-batch-form";
import { CopyDetailSheet } from "./copy-detail-sheet";
import { CopyLabelPrintBar } from "./copy-label-print-bar";
import { ReadInPlaceDialog } from "./read-in-place-dialog";

const CONDITIONS: LibraryCopyWrite["condition"][] = ["good", "fair", "damaged", "lost"];

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
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setViewingCopyId(row.original.id);
              }}
            >
              {t("viewDetail")}
            </Button>
            {canManage && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void printCopyLabel(row.original.id);
                }}
              >
                {t("printLabel")}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setReadingInPlace(row.original.id);
              }}
            >
              {t("readInPlace")}
            </Button>
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

function CopyForm({ titleId, onDone }: { titleId: string; onDone: () => void }): ReactElement {
  const t = useTranslations("app.library.copies.form");
  const tCopies = useTranslations("app.library.copies");
  const tCondition = useTranslations("app.library.copies.condition");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateLibraryCopyMutation();
  const options = useLibraryCatalogueOptionsQuery();

  const [barcode, setBarcode] = useState("");
  const [condition, setCondition] = useState<LibraryCopyWrite["condition"]>("good");
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [partnerId, setPartnerId] = useState("");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            titleId,
            barcode: barcode.trim(),
            condition,
            notes: notes.trim() || undefined,
            category_id: categoryId || undefined,
            location_id: locationId || undefined,
            source_id: sourceId || undefined,
            partner_id: partnerId || undefined,
            is_opac: true,
          },
          {
            onSuccess: () => {
              toast.success(tCopies("form.saved"));
              onDone();
            },
            onError: (error) => {
              toast.error(
                error instanceof ApiError
                  ? apiErrorMessage(error.code)
                  : apiErrorMessage("UNKNOWN"),
              );
            },
          },
        );
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("barcode")}</span>
        <Input
          value={barcode}
          onChange={(e) => {
            setBarcode(e.target.value);
          }}
          required
          maxLength={64}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("condition")}</span>
        <Select
          value={condition}
          onValueChange={(value) => {
            setCondition(value as LibraryCopyWrite["condition"]);
          }}
          options={CONDITIONS.map((value) => ({
            value: value as string,
            label: tCondition(value as string),
          }))}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("notes")}</span>
        <Input
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          maxLength={500}
        />
      </label>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("category")}</span>
          <Select
            options={(options.data?.collection_categories ?? []).map((c) => ({
              value: c.id,
              label: c.name,
            }))}
            value={categoryId}
            onValueChange={setCategoryId}
            placeholder={t("categoryPlaceholder")}
            disabled={options.isLoading}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("location")}</span>
          <Select
            options={(options.data?.locations ?? []).map((l) => ({ value: l.id, label: l.name }))}
            value={locationId}
            onValueChange={setLocationId}
            placeholder={t("locationPlaceholder")}
            disabled={options.isLoading}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("source")}</span>
          <Select
            options={(options.data?.acquisition_sources ?? []).map((s) => ({
              value: s.id,
              label: s.name,
            }))}
            value={sourceId}
            onValueChange={setSourceId}
            placeholder={t("sourcePlaceholder")}
            disabled={options.isLoading}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("partner")}</span>
          <Select
            options={(options.data?.partners ?? []).map((p) => ({ value: p.id, label: p.name }))}
            value={partnerId}
            onValueChange={setPartnerId}
            placeholder={t("partnerPlaceholder")}
            disabled={options.isLoading}
          />
        </label>
      </div>
      <Button type="submit" loading={create.isPending}>
        {t("save")}
      </Button>
    </form>
  );
}

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
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type LibraryCopy,
  type LibraryCopyWrite,
  printCopyLabel,
  useCreateLibraryCopyMutation,
  useLibraryCopiesQuery,
  useLibraryTitleQuery,
} from "../api";
import { useOrderedSelection } from "../use-ordered-selection";

import { CopyLabelPrintBar } from "./copy-label-print-bar";

const CONDITIONS: LibraryCopyWrite["condition"][] = ["good", "fair", "damaged", "lost"];

export function TitleCopiesView({ titleId }: { titleId: string }): ReactElement {
  const t = useTranslations("app.library.copies");
  const title = useLibraryTitleQuery(titleId);
  const { data, isLoading } = useLibraryCopiesQuery(titleId);
  const [adding, setAdding] = useState(false);
  const { selection, onSelectionChange, orderedIds, clear } = useOrderedSelection();
  const copies = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryCopy>[]>(
    () => [
      selectionColumn<LibraryCopy>(),
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
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void printCopyLabel(row.original.id);
            }}
          >
            {t("printLabel")}
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={title.data?.title ?? ""} title={t("title")} />
      <div className="flex justify-end">
        <Button
          size="sm"
          icon={<Plus />}
          onClick={() => {
            setAdding(true);
          }}
        >
          {t("addCopy")}
        </Button>
      </div>

      <CopyLabelPrintBar selectedIds={orderedIds} onClear={clear} />

      <DataTable
        data={copies}
        columns={columns}
        rowCount={copies.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
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

  const [barcode, setBarcode] = useState("");
  const [condition, setCondition] = useState<LibraryCopyWrite["condition"]>("good");
  const [notes, setNotes] = useState("");

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
      <Button type="submit" loading={create.isPending}>
        {t("save")}
      </Button>
    </form>
  );
}

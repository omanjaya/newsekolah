"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  PageHeader,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type LibraryStocktake,
  useLibraryStocktakesQuery,
  useStartStocktakeMutation,
} from "../api";

export function StocktakeView(): ReactElement {
  const t = useTranslations("app.library.stocktake");
  const locale = useLocale() as Locale;
  const { data, isLoading } = useLibraryStocktakesQuery();
  const [starting, setStarting] = useState(false);
  const sessions = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryStocktake>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      {
        accessorKey: "started_on",
        header: t("columns.startedOn"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.started_on, { locale }),
      },
      {
        accessorKey: "status",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "open" ? "accent" : "neutral"}>
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            href={`/library/stocktake/${row.original.id}`}
            className="text-[13px] font-medium text-accent hover:underline"
          >
            {t("scan.heading")}
          </Link>
        ),
      },
    ],
    [t, locale],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <div className="flex justify-end">
        <Button
          size="sm"
          icon={<Plus />}
          onClick={() => {
            setStarting(true);
          }}
        >
          {t("startNew")}
        </Button>
      </div>

      <DataTable
        data={sessions}
        columns={columns}
        rowCount={sessions.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
        isLoading={isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState icon={<domainIcons.library aria-hidden="true" />} title={t("emptyTitle")} />
        }
      />

      <Dialog
        open={starting}
        onOpenChange={(open) => {
          setStarting(open);
        }}
      >
        <DialogContent title={t("startNew")}>
          <StartStocktakeForm
            onDone={() => {
              setStarting(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StartStocktakeForm({ onDone }: { onDone: () => void }): ReactElement {
  const t = useTranslations("app.library.stocktake.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const start = useStartStocktakeMutation();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start.mutate(
          { name: name.trim(), notes: notes.trim() || undefined },
          {
            onSuccess: onDone,
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
        <span className="font-medium">{t("name")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
          maxLength={160}
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
      <Button type="submit" loading={start.isPending}>
        {t("start")}
      </Button>
    </form>
  );
}

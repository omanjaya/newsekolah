"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  Input,
  Textarea,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { formatShortDate } from "../lib/short-date";
import {
  type LibraryStocktake,
  useLibraryStocktakesQuery,
  useStartStocktakeMutation,
} from "../stocktake-api";

import { LibraryWorkspaceNav, useLibraryShortcuts } from "./library-workspace-nav";

export function StocktakeView(): ReactElement {
  const t = useTranslations("app.library.stocktake");
  const router = useRouter();
  const locale = useLocale() as Locale;
  const { data, isLoading, error, refetch } = useLibraryStocktakesQuery();
  const shortcuts = useLibraryShortcuts([{ report: "accessionRegister" }]);
  const [starting, setStarting] = useState(false);
  const sessions = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryStocktake>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: false,
        meta: { card: "title" },
        // Body text, as in the other areas' tables: the row itself opens
        // the session (onRowActivate below).
        cell: ({ row }) => <span className="font-semibold text-fg">{row.original.name}</span>,
      },
      {
        accessorKey: "started_on",
        header: t("columns.startedOn"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) => formatShortDate(row.original.started_on, locale),
      },
      {
        accessorKey: "status",
        header: t("columns.status"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => (
          <Badge
            tone={row.original.status === "open" ? "info" : "neutral"}
            dot={row.original.status === "open"}
          >
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        // Not the row's actions column, whose phone slot is the card's
        // corner: on a phone the whole card opens the session, so this
        // labelled link stays in the desktop table only, as a secondary
        // beside the page's one primary. The id "action" keeps it out of
        // the column menu.
        id: "action",
        header: () => <span className="sr-only">{t("columns.actions")}</span>,
        enableSorting: false,
        meta: { card: "hidden", align: "end" },
        cell: ({ row }) => (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/library/stocktake/${row.original.id}`}>
              {row.original.status === "open" ? t("continueScan") : t("viewResult")}
            </Link>
          </Button>
        ),
      },
    ],
    [t, locale],
  );

  const startButton = (
    <Button
      icon={<Plus />}
      onClick={() => {
        setStarting(true);
      }}
    >
      {t("startNew")}
    </Button>
  );

  return (
    <AppPage
      nav={<LibraryWorkspaceNav area="catalogue" />}
      primaryAction={startButton}
      secondaryActions={shortcuts}
    >
      <DataTable
        stateKey="features/library/components/stocktake-view:1"
        mode="local"
        data={sessions}
        columns={columns}
        searchable={sessions.length > 10}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        getRowId={(item) => item.id}
        onRowActivate={(item) => {
          router.push(`/library/stocktake/${item.id}`);
        }}
        emptyState={
          <EmptyState
            icon={<domainIcons.library aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={startButton}
          />
        }
      />

      <Dialog
        open={starting}
        onOpenChange={(open) => {
          setStarting(open);
        }}
      >
        <DialogContent title={t("startNew")} size="sm">
          <StartStocktakeForm
            onDone={(stocktakeId) => {
              setStarting(false);
              router.push(`/library/stocktake/${stocktakeId}`);
            }}
          />
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}

function StartStocktakeForm({ onDone }: { onDone: (stocktakeId: string) => void }): ReactElement {
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
            onSuccess: (stocktake) => {
              onDone(stocktake.id);
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
      <Field label={t("name")} required>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
          maxLength={160}
        />
      </Field>
      <Field label={t("notes")}>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          maxLength={500}
        />
      </Field>
      <DialogFooter>
        <Button type="submit" loading={start.isPending}>
          {t("start")}
        </Button>
      </DialogFooter>
    </form>
  );
}

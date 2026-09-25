"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type Counseling } from "../api";
import { useDeleteCounselingMutation, useStudentCounselingsQuery } from "../api-counseling-extras";

import { CounselingDetailDialog } from "./counseling-detail-dialog";
import { CounselingForm } from "./counseling-form";

/**
 * A student's counseling history, embedded in their discipline profile.
 * Reuses the same detail dialog, edit form, and delete flow as the
 * counselor's own "Catatan saya" tab (`CounselingView`) -- only notes the
 * caller is allowed to read come back from the API, so no extra
 * visibility filtering happens here.
 */
export function StudentCounselingHistory({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.discipline.counseling");
  const tDetail = useTranslations("app.discipline.studentDetail");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const { data, isLoading, isError, refetch } = useStudentCounselingsQuery(studentId);
  const remove = useDeleteCounselingMutation();

  const [editing, setEditing] = useState<Counseling | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Counseling | null>(null);

  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<Counseling>[]>(
    () => [
      {
        id: "title",
        header: t("columns.title"),
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            className="text-left text-fg underline-offset-2 hover:underline focus-visible:underline"
            onClick={() => {
              setViewingId(row.original.id);
            }}
          >
            {row.original.title}
          </button>
        ),
      },
      {
        id: "date",
        header: t("columns.date"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.session_at, { locale }),
      },
      {
        id: "kind",
        header: t("columns.kind"),
        enableSorting: false,
        cell: ({ row }) => t(`form.kindOptions.${row.original.kind}`),
      },
      {
        id: "topic",
        header: t("columns.topic"),
        enableSorting: false,
        cell: ({ row }) => t(`form.topicOptions.${row.original.topic}`),
      },
    ],
    [t, locale],
  );

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
      <h2 className="text-[16px] font-medium text-fg">{tDetail("counselingHistory")}</h2>
      {isError ? (
        <QueryError retry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("emptyTitle")}
          description={tDetail("counselingHistoryEmpty")}
        />
      ) : (
        <DataTable
          stateKey="features/discipline/components/student-counseling-history:1"
          mode="local"
          data={items}
          columns={columns}
          rowCount={items.length}
          isLoading={false}
          searchable={false}
          getRowId={(item) => item.id}
          onRowActivate={(item) => {
            setViewingId(item.id);
          }}
        />
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent title={t("form.editTitle")} className="max-w-2xl">
          {editing !== null && (
            <CounselingForm
              initial={editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <CounselingDetailDialog
        counselingId={viewingId}
        onClose={() => {
          setViewingId(null);
        }}
        onEdit={() => {
          const current = items.find((item) => item.id === viewingId);
          if (current) setEditing(current);
          setViewingId(null);
        }}
        onDelete={() => {
          const current = items.find((item) => item.id === viewingId);
          if (current) setPendingDelete(current);
          setViewingId(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("deleteTitle")}
        description={pendingDelete ? t("deleteBody", { title: pendingDelete.title }) : ""}
        confirmLabel={t("deleteConfirm")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            toast.success(t("deleted"));
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    </section>
  );
}

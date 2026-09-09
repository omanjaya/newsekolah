"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Button, DataTable, EmptyState, Select, domainIcons, useToast } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useClassesQuery, useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type WarningLetter,
  useWarningLetterDocumentUrlMutation,
  useWarningLettersQuery,
} from "../api";

export function IssuedLettersPanel(): ReactElement {
  const t = useTranslations("app.discipline.warningLetters");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [classId, setClassId] = useState("");
  const classes = useClassesQuery();
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const { data, isLoading } = useWarningLettersQuery(classId || undefined);
  const documentUrl = useWarningLetterDocumentUrlMutation();

  const items = data?.data ?? [];
  const classOptions = [
    { value: "all", label: t("filters.classAll") },
    ...(classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  function download(letterId: string) {
    documentUrl.mutate(letterId, {
      onSuccess: (result) => {
        window.open(result.url, "_blank", "noopener,noreferrer");
      },
      onError: (error) => {
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        );
      },
    });
  }

  const columns = useMemo<ColumnDef<WarningLetter>[]>(
    () => [
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        cell: ({ row }) =>
          studentMap.get(row.original.student_user_id)?.name ?? t("unknownStudent"),
      },
      { accessorKey: "level_label", header: t("columns.level"), enableSorting: false },
      { accessorKey: "letter_number", header: t("columns.letterNumber"), enableSorting: false },
      { accessorKey: "total_points", header: t("columns.points"), enableSorting: false },
      {
        id: "issuedAt",
        header: t("columns.issuedAt"),
        enableSorting: false,
        cell: ({ row }) =>
          formatDateTime(row.original.issued_at, { locale, timeZone: me?.tenant.timezone }),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.has_document ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                download(row.original.id);
              }}
            >
              {t("download")}
            </Button>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- download closes over stable mutation/toast
    [t, locale, studentMap, me?.tenant.timezone],
  );

  return (
    <div className="flex flex-col gap-4">
      <Select
        options={classOptions}
        value={classId || "all"}
        onValueChange={(v) => {
          setClassId(v === "all" ? "" : v);
        }}
        className="w-44"
        aria-label={t("filters.class")}
      />
      <DataTable
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
        isLoading={isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.violation aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />
    </div>
  );
}

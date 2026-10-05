"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { useMemo } from "react";

import type { ClassRef, SubjectRef } from "../../reference/api";
import type { Journal } from "../api";

/** The `/journal` list's columns (shared table density, docs/05-shared-components.md). */
export function useJournalColumns({
  t,
  formatDate,
  classMap,
  subjectMap,
  onEdit,
  onDelete,
}: {
  t: (key: string) => string;
  formatDate: (lessonDate: string) => string;
  classMap: Map<string, ClassRef>;
  subjectMap: Map<string, SubjectRef>;
  onEdit: (journal: Journal) => void;
  onDelete: (journal: Journal) => void;
}): ColumnDef<Journal>[] {
  return useMemo<ColumnDef<Journal>[]>(
    () => [
      {
        accessorKey: "lesson_date",
        header: t("columns.date"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.lesson_date),
      },
      {
        id: "class",
        header: t("columns.class"),
        enableSorting: false,
        cell: ({ row }) => classMap.get(row.original.class_id)?.name ?? t("unknown"),
      },
      {
        id: "subject",
        header: t("columns.subject"),
        enableSorting: false,
        cell: ({ row }) => subjectMap.get(row.original.subject_id)?.name ?? t("unknown"),
      },
      {
        accessorKey: "topic",
        header: t("columns.topic"),
        enableSorting: false,
        cell: ({ row }) => <span className="line-clamp-1">{row.original.topic}</span>,
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={<MoreHorizontal />} aria-label={t("columns.actions")} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  onEdit(row.original);
                }}
              >
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  onDelete(row.original);
                }}
              >
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onEdit/onDelete are stable setState closures from the caller
    [t, formatDate, classMap, subjectMap],
  );
}

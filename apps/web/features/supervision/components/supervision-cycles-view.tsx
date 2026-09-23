"use client";

import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  IconButton,
  PageHeader,
  domainIcons,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useCan } from "../../../lib/session/session-provider";
import { type SupervisionCycle, useSupervisionCyclesQuery } from "../api";

import { SupervisionCycleForm } from "./supervision-cycle-form";

export function SupervisionCyclesView(): ReactElement {
  const t = useTranslations("app.supervision.cycles");
  const router = useRouter();
  const canManage = useCan("manage_supervision");

  const { data, isLoading, isError, refetch } = useSupervisionCyclesQuery();
  const [editing, setEditing] = useState<SupervisionCycle | "new" | null>(null);

  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<SupervisionCycle>[]>(() => {
    const base: ColumnDef<SupervisionCycle>[] = [
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      {
        id: "criteria",
        header: t("columns.criteria"),
        enableSorting: false,
        cell: ({ row }) => row.original.instrument.criteria.length,
      },
      {
        id: "scale",
        header: t("columns.scale"),
        enableSorting: false,
        cell: ({ row }) =>
          `${row.original.instrument.scale_min}–${row.original.instrument.scale_max}`,
      },
    ];
    if (!canManage) return base;
    return [
      ...base,
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <IconButton
            icon={<Pencil />}
            aria-label={t("edit")}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(row.original);
            }}
          />
        ),
      },
    ];
  }, [t, canManage]);

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the table scrolls its rows internally.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canManage && (
            <Button
              size="sm"
              icon={<Plus />}
              onClick={() => {
                setEditing("new");
              }}
            >
              {t("add")}
            </Button>
          )
        }
      />

      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/supervision/components/supervision-cycles-view:1"
          mode="local"
          data={items}
          columns={columns}
          rowCount={items.length}
          pagination={{ pageIndex: 0, pageSize: 50 }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter=""
          isLoading={isLoading}
          getRowId={(item) => item.id}
          onRowActivate={(item) => {
            router.push(`/supervision/cycles/${item.id}`);
          }}
          fillHeight
          emptyState={
            isError ? (
              <QueryError retry={refetch} />
            ) : (
              <EmptyState
                icon={<domainIcons.supervision aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
              />
            )
          }
        />
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent
          title={editing === "new" ? t("form.createTitle") : t("form.editTitle")}
          className="max-w-2xl"
        >
          {editing !== null && (
            <SupervisionCycleForm
              initial={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

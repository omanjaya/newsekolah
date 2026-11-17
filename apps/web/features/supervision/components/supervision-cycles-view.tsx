"use client";

import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  FirstUseEmptyState,
  RowActionsMenu,
  domainIcons,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useCan } from "../../../lib/session/session-provider";
import { type SupervisionCycle, useSupervisionCyclesQuery } from "../api";

import { SupervisionCycleForm } from "./supervision-cycle-form";
import { SupervisionWorkspaceNav } from "./supervision-workspace-nav";

/**
 * The supervision cycles of the school, each with its instrument; a row
 * opens the cycle, where observations are scheduled, filled in and
 * reported. Creating and editing a cycle (and its instrument) is for
 * those who manage supervision.
 */
export function SupervisionCyclesView(): ReactElement {
  const t = useTranslations("app.supervision.cycles");
  const router = useRouter();
  const canManage = useCan("manage_supervision");

  const { data, isLoading, isError, error, refetch, isRefetching } = useSupervisionCyclesQuery();
  const [editing, setEditing] = useState<SupervisionCycle | "new" | null>(null);

  const items = data?.data ?? [];
  const startCreate = () => {
    setEditing("new");
  };

  const columns = useMemo<ColumnDef<SupervisionCycle>[]>(() => {
    const base: ColumnDef<SupervisionCycle>[] = [
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: false,
        meta: { card: "title" },
      },
      {
        id: "instrument",
        header: t("columns.instrument"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) => row.original.instrument.name,
      },
      {
        id: "criteria",
        header: t("columns.criteria"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.instrument.criteria.length}</span>
        ),
      },
      {
        id: "scale",
        header: t("columns.scale"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {t("scaleRange", {
              min: row.original.instrument.scale_min,
              max: row.original.instrument.scale_max,
            })}
          </span>
        ),
      },
    ];
    if (!canManage) return base;
    return [
      ...base,
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <RowActionsMenu
            ariaLabel={t("rowActions", { name: row.original.name })}
            items={[
              {
                label: t("edit"),
                icon: <Pencil />,
                onClick: () => {
                  setEditing(row.original);
                },
              },
            ]}
          />
        ),
      },
    ];
  }, [t, canManage]);

  const empty = {
    icon: <domainIcons.supervision />,
    title: t("emptyTitle"),
    description: canManage ? t("emptyBody") : t("emptyBodyReader"),
  };

  return (
    <AppPage
      variant="fit"
      nav={<SupervisionWorkspaceNav />}
      primaryAction={
        canManage ? (
          <Button icon={<Plus />} onClick={startCreate}>
            {t("add")}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/supervision/components/supervision-cycles-view:1"
          mode="local"
          data={items}
          columns={columns}
          rowCount={items.length}
          toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
          isLoading={isLoading}
          error={isError ? error : undefined}
          onRetry={() => void refetch()}
          retrying={isRefetching}
          getRowId={(item) => item.id}
          onRowActivate={(item) => {
            router.push(`/supervision/cycles/${item.id}`);
          }}
          fillHeight
          emptyState={
            canManage ? (
              <FirstUseEmptyState {...empty} actionLabel={t("add")} onAction={startCreate} />
            ) : (
              <EmptyState {...empty} />
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
          size="lg"
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
    </AppPage>
  );
}

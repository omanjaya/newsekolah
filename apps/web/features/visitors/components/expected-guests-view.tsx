"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  domainIcons,
  EmptyState,
  FilteredEmptyState,
  FirstUseEmptyState,
  RowActionsMenu,
  SemanticStatusBadge,
  useToast,
  type DataTableFilterDef,
  type SemanticStatus,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarX2, LogIn, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { DayStepper } from "../../attendance/components/day-stepper";
import { useDirectoryNames } from "../../reference/directory-names";
import { VisitorsWorkspaceNav } from "../../student-services/components/service-workspace-nav";
import { type ExpectedGuest, useCancelExpectedGuestMutation, useExpectedGuestsQuery } from "../api";

import { CheckInForm } from "./check-in-form";
import { ExpectedGuestForm } from "./expected-guest-form";

const EXPECTED_STATUS: Record<string, SemanticStatus> = {
  pending: "pending",
  arrived: "completed",
  expired: "expired",
  cancelled: "cancelled",
};

const ONLY_PENDING_VALUES = ["", "true"] as const;

/**
 * The office's ahead-of-time list, so the guard finds a name instead of
 * typing it: one day at a time, each guest with whom they will see and why,
 * checked in or cancelled from their row.
 */
export function ExpectedGuestsView(): ReactElement {
  const t = useTranslations("app.visitors.expected");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_visitors");
  const { me } = useSession();
  const today = todayInZone(me?.tenant.timezone);

  const [date, setDate] = useDateFilter("date", today);
  const [onlyPending, setOnlyPending] = useUrlState<(typeof ONLY_PENDING_VALUES)[number]>(
    "only_pending",
    ONLY_PENDING_VALUES,
    "",
  );
  const [creating, setCreating] = useState(false);
  const [checkingIn, setCheckingIn] = useState<ExpectedGuest | null>(null);
  const [cancelling, setCancelling] = useState<ExpectedGuest | null>(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useExpectedGuestsQuery(
    date,
    onlyPending !== "true",
  );
  const cancel = useCancelExpectedGuestMutation();

  const items = data?.data ?? [];
  const hostMap = useDirectoryNames(items.map((item) => item.host_user_id));
  const startCreate = () => {
    setCreating(true);
  };

  const filters: DataTableFilterDef[] = [
    {
      id: "onlyPending",
      label: t("filters.onlyPending"),
      value: onlyPending,
      onChange: (value) => {
        setOnlyPending(value as (typeof ONLY_PENDING_VALUES)[number]);
      },
      type: "boolean",
      activeValue: "true",
    },
  ];

  const columns = useMemo<ColumnDef<ExpectedGuest>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: t("columns.name"),
        enableSorting: false,
        meta: { card: "title" },
      },
      {
        accessorKey: "organization",
        header: t("columns.organization"),
        enableSorting: false,
        meta: { card: "subtitle" },
      },
      {
        id: "host",
        header: t("columns.host"),
        enableSorting: false,
        cell: ({ row }) => hostMap.get(row.original.host_user_id)?.name ?? t("unknownHost"),
      },
      {
        accessorKey: "purpose",
        header: t("columns.purpose"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-sm">{row.original.purpose || "–"}</span>
        ),
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => (
          <SemanticStatusBadge
            status={EXPECTED_STATUS[row.original.status] ?? "pending"}
            label={t(`status.${row.original.status}`)}
          />
        ),
      },
      // Read-only roles have no row actions, so they get no empty "Aksi" column.
      ...(canManage
        ? [
            {
              id: "actions",
              header: t("columns.actions"),
              enableSorting: false,
              cell: ({ row }: { row: { original: ExpectedGuest } }) =>
                row.original.status === "pending" ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<LogIn />}
                      onClick={() => {
                        setCheckingIn(row.original);
                      }}
                    >
                      {t("checkIn")}
                    </Button>
                    <RowActionsMenu
                      ariaLabel={t("rowActions", { name: row.original.full_name })}
                      items={[
                        {
                          label: t("cancel"),
                          icon: <CalendarX2 />,
                          tone: "danger",
                          onClick: () => {
                            setCancelling(row.original);
                          },
                        },
                      ]}
                    />
                  </div>
                ) : null,
            } satisfies ColumnDef<ExpectedGuest>,
          ]
        : []),
    ],
    [t, canManage, hostMap],
  );

  const empty = {
    icon: <domainIcons.visitor />,
    title: date === today ? t("emptyTitle") : t("emptyTitleOther"),
    description: t("emptyBody"),
  };

  return (
    <AppPage
      variant="fit"
      nav={<VisitorsWorkspaceNav />}
      documentTitle={t("documentTitle")}
      actions={
        <DayStepper
          value={date}
          onChange={setDate}
          today={today}
          labels={{
            previous: t("day.previous"),
            next: t("day.next"),
            today: t("day.today"),
            date: t("filters.date"),
          }}
        />
      }
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
          stateKey="features/visitors/components/expected-guests-view:1"
          mode="local"
          data={items}
          columns={columns}
          rowCount={items.length}
          searchable={false}
          filters={filters}
          filtersLabels={{
            reset: t("filters.reset"),
            removeFilter: (label) => t("filters.removeFilter", { label }),
          }}
          isLoading={isLoading}
          error={isError ? error : undefined}
          onRetry={() => void refetch()}
          retrying={isRefetching}
          getRowId={(item) => item.id}
          fillHeight
          emptyState={
            onlyPending === "true" ? (
              <FilteredEmptyState
                onReset={() => {
                  setOnlyPending("");
                }}
              />
            ) : canManage ? (
              <FirstUseEmptyState {...empty} actionLabel={t("add")} onAction={startCreate} />
            ) : (
              <EmptyState {...empty} />
            )
          }
        />
      </div>

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
        title={t("cancelDialog.title")}
        description={t("cancelDialog.body", { name: cancelling?.full_name ?? "" })}
        confirmLabel={t("cancel")}
        tone="danger"
        confirming={cancel.isPending}
        onConfirm={() => {
          if (!cancelling) return;
          cancel.mutate(cancelling.id, {
            onSuccess: () => {
              toast.success(t("cancelled"));
            },
            onError: (cancelError) => {
              toast.error(
                cancelError instanceof ApiError
                  ? apiErrorMessage(cancelError.code)
                  : apiErrorMessage("UNKNOWN"),
              );
            },
            onSettled: () => {
              setCancelling(null);
            },
          });
        }}
      />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("add")}>
          {creating && (
            <ExpectedGuestForm
              defaultDate={date}
              onDone={() => {
                setCreating(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={checkingIn !== null}
        onOpenChange={(open) => {
          if (!open) setCheckingIn(null);
        }}
      >
        <DialogContent title={t("checkIn")}>
          {checkingIn && (
            <CheckInForm
              expectedGuestId={checkingIn.id}
              defaultFullName={checkingIn.full_name}
              defaultOrganization={checkingIn.organization}
              defaultHostUserId={checkingIn.host_user_id}
              defaultPurpose={checkingIn.purpose}
              onDone={() => {
                setCheckingIn(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}

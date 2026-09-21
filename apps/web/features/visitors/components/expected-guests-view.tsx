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
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import { type ExpectedGuest, useCancelExpectedGuestMutation, useExpectedGuestsQuery } from "../api";

import { CheckInForm } from "./check-in-form";
import { ExpectedGuestForm } from "./expected-guest-form";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The office's ahead-of-time list, so the guard can find a name instead of typing it. */
export function ExpectedGuestsView(): ReactElement {
  const t = useTranslations("app.visitors.expected");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_visitors");

  const [date, setDate] = useDateFilter("date", today());
  const [creating, setCreating] = useState(false);
  const [checkingIn, setCheckingIn] = useState<ExpectedGuest | null>(null);

  const staff = useDirectoryQuery("staff");
  const teachers = useDirectoryQuery("teacher");
  const hostMap = useLookup([...(staff.data?.data ?? []), ...(teachers.data?.data ?? [])]);
  const { data, isLoading } = useExpectedGuestsQuery(date, true);
  const cancel = useCancelExpectedGuestMutation();

  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<ExpectedGuest>[]>(
    () => [
      { accessorKey: "full_name", header: t("columns.name"), enableSorting: false },
      { accessorKey: "organization", header: t("columns.organization"), enableSorting: false },
      {
        id: "host",
        header: t("columns.host"),
        enableSorting: false,
        cell: ({ row }) => hostMap.get(row.original.host_user_id)?.name ?? t("unknownHost"),
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "pending" ? "accent" : "neutral"}>
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          canManage && row.original.status === "pending" ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setCheckingIn(row.original);
                }}
              >
                {t("checkIn")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  cancel.mutate(row.original.id, {
                    onSuccess: () => {
                      toast.success(t("cancelled"));
                    },
                    onError: (error) => {
                      toast.error(
                        error instanceof ApiError
                          ? apiErrorMessage(error.code)
                          : apiErrorMessage("UNKNOWN"),
                      );
                    },
                  });
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, canManage, hostMap, cancel, toast, apiErrorMessage],
  );

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the table scrolls its rows internally while the
    // filter row stays put. See school/components/users-view.tsx for the
    // reference pattern.
    <div className="flex flex-col gap-4 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("filters.date")}</span>
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
            }}
            className="w-44"
          />
        </label>
        {canManage && (
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setCreating(true);
            }}
          >
            {t("add")}
          </Button>
        )}
      </div>

      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/visitors/components/expected-guests-view:1"
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
          fillHeight
          emptyState={
            <EmptyState
              icon={<domainIcons.visitor aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
            />
          }
        />
      </div>

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
        }}
      >
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
    </div>
  );
}

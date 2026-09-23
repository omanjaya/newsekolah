"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  ConfirmDialog,
  Checkbox,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type Extracurricular,
  useDeleteExtracurricularMutation,
  useExtracurricularsQuery,
} from "../api";

import { ClubForm } from "./club-form";
import { MembershipPolicyForm } from "./membership-policy-form";

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function ClubsView(): ReactElement {
  const t = useTranslations("app.activities.clubs");
  const canManage = useCan("manage_extracurriculars");
  const canManagePolicy = useCan("manage_settings");
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data, isLoading } = useExtracurricularsQuery(includeInactive);
  const [editing, setEditing] = useState<Extracurricular | "new" | null>(null);

  const [pendingDelete, setPendingDelete] = useState<Extracurricular | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const remove = useDeleteExtracurricularMutation();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const clubs = data?.data ?? [];

  const columns = useMemo<ColumnDef<Extracurricular>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            href={`/activities/clubs/${row.original.id}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "meeting_day",
        header: t("columns.schedule"),
        enableSorting: false,
        cell: ({ row }) => {
          const club = row.original;
          if (club.meeting_day === undefined) return "-";
          const day = t(`weekdays.${WEEKDAY_KEYS[club.meeting_day] ?? "sunday"}`);
          const time =
            club.meeting_start && club.meeting_end
              ? `${club.meeting_start}-${club.meeting_end}`
              : (club.meeting_start ?? "");
          return `${day}${time ? ` ${time}` : ""}`;
        },
      },
      {
        accessorKey: "capacity",
        header: t("columns.capacity"),
        enableSorting: false,
        cell: ({ row }) => row.original.capacity ?? t("noLimit"),
      },
      {
        accessorKey: "is_active",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? "accent" : "neutral"}>
            {t(row.original.is_active ? "status.active" : "status.inactive")}
          </Badge>
        ),
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: t("columns.actions"),
              enableSorting: false,
              cell: ({ row }: { row: { original: Extracurricular } }) => (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditing(row.original);
                    }}
                  >
                    {t("edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPendingDelete(row.original);
                    }}
                  >
                    {t("delete")}
                  </Button>
                </div>
              ),
            } satisfies ColumnDef<Extracurricular>,
          ]
        : []),
    ],
    [t, canManage],
  );

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the table scrolls its rows internally while the
    // filter row stays put. See school/components/users-view.tsx for the
    // reference pattern.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-11 items-center gap-2 text-[13px] sm:min-h-0">
          <Checkbox
            checked={includeInactive}
            onCheckedChange={(v) => {
              setIncludeInactive(v === true);
            }}
          />
          {t("includeInactive")}
        </label>
        {(canManage || canManagePolicy) && (
          <div className="grid w-full gap-2 sm:flex sm:w-auto">
            {canManagePolicy && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPolicyOpen(true);
                }}
              >
                {t("policy.title")}
              </Button>
            )}
            {canManage && (
              <Button
                size="sm"
                icon={<Plus />}
                className="order-first sm:order-none"
                onClick={() => {
                  setEditing("new");
                }}
              >
                {t("add")}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/activities/components/clubs-view:1"
          mode="local"
          data={clubs}
          columns={columns}
          rowCount={clubs.length}
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
              icon={<Users aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
            />
          }
        />
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent title={editing === "new" ? t("form.createTitle") : t("form.editTitle")}>
          {editing !== null && (
            <ClubForm
              initial={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent title={t("policy.title")}>
          {policyOpen && (
            <MembershipPolicyForm
              onDone={() => {
                setPolicyOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("deleteTitle")}
        description={t("deleteBody")}
        confirmLabel={t("delete")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            toast.success(t("deleted"));
            setPendingDelete(null);
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          }
        }}
      />
    </div>
  );
}

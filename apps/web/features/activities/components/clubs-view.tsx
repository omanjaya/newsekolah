"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  useToast,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
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
  const tNav = useTranslations("app.activities");
  const tShell = useTranslations("app.shell.nav.items");
  const t = useTranslations("app.activities.clubs");
  const [search, setSearch] = useState("");
  const canManage = useCan("manage_extracurriculars");
  const canManagePolicy = useCan("manage_settings");
  const [includeInactiveParam, setIncludeInactiveParam] = useUrlState<"" | "true">(
    "include_inactive",
    ["", "true"],
    "",
  );
  const includeInactive = includeInactiveParam === "true";
  const { data, isLoading, error, refetch } = useExtracurricularsQuery(includeInactive);
  const [editing, setEditing] = useState<Extracurricular | "new" | null>(null);

  const [pendingDelete, setPendingDelete] = useState<Extracurricular | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const remove = useDeleteExtracurricularMutation();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const clubs = data?.data ?? [];

  const filters: DataTableFilterDef[] = [
    {
      id: "includeInactive",
      label: t("includeInactive"),
      value: includeInactiveParam,
      onChange: (value) => {
        setIncludeInactiveParam(value as "" | "true");
      },
      type: "boolean",
      activeValue: "true",
    },
  ];

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
    <AppPage
      variant="fit"
      title={tNav("navLabelClubs")}
      eyebrow={tShell("studentActivities")}
      primaryAction={
        canManage ? (
          <Button
            icon={<Plus />}
            onClick={() => {
              setEditing("new");
            }}
          >
            {t("add")}
          </Button>
        ) : undefined
      }
      secondaryActions={
        canManagePolicy
          ? [
              {
                label: t("policy.title"),
                icon: <SlidersHorizontal />,
                onSelect: () => {
                  setPolicyOpen(true);
                },
              },
            ]
          : undefined
      }
    >
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
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          filters={filters}
          filtersLabels={{
            reset: t("filters.reset"),
            removeFilter: (label) => t("filters.removeFilter", { label }),
          }}
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          getRowId={(item) => item.id}
          fillHeight
          emptyState={
            <EmptyState
              icon={<Users aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
              action={
                canManage ? (
                  <Button
                    icon={<Plus />}
                    onClick={() => {
                      setEditing("new");
                    }}
                  >
                    {t("add")}
                  </Button>
                ) : undefined
              }
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
    </AppPage>
  );
}

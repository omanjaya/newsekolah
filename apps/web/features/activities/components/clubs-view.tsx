"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  RowActionsMenu,
  useToast,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, SlidersHorizontal, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
import { clubScheduleLabel } from "../lib/club-schedule";

import { ClubForm } from "./club-form";
import { MembershipPolicyForm } from "./membership-policy-form";

/**
 * The extracurriculars of the year, a tab of the student activities area
 * (its title and group come from the navigation). A row opens the club;
 * editing and deleting wait in the row's menu.
 */
export function ClubsView(): ReactElement {
  const t = useTranslations("app.activities.clubs");
  const locale = useLocale() as Locale;
  const router = useRouter();
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
        meta: { card: "title" },
        // The whole row opens the club (onRowActivate), so the name is
        // plain text rather than a link that looks like every other cell.
        cell: ({ row }) => <span className="font-medium text-fg">{row.original.name}</span>,
      },
      {
        accessorKey: "meeting_day",
        header: t("columns.schedule"),
        enableSorting: false,
        cell: ({ row }) =>
          clubScheduleLabel(row.original, (key) => t(`weekdays.${key}`), locale) ?? "-",
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
        meta: { card: "meta" },
        // Active is the normal state, said quietly; only an inactive club
        // stands out with a badge.
        cell: ({ row }) =>
          row.original.is_active ? (
            <span className="text-fg-muted">{t("status.active")}</span>
          ) : (
            <Badge tone="neutral">{t("status.inactive")}</Badge>
          ),
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: t("columns.actions"),
              enableSorting: false,
              cell: ({ row }: { row: { original: Extracurricular } }) => (
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
                    {
                      label: t("delete"),
                      icon: <Trash2 />,
                      tone: "danger",
                      onClick: () => {
                        setPendingDelete(row.original);
                      },
                    },
                  ]}
                />
              ),
            } satisfies ColumnDef<Extracurricular>,
          ]
        : []),
    ],
    [t, canManage, locale],
  );

  return (
    <AppPage
      variant="fit"
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
      primaryActionCompact={
        canManage
          ? {
              icon: <Plus />,
              label: t("add"),
              onSelect: () => {
                setEditing("new");
              },
            }
          : undefined
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
          toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
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
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          getRowId={(item) => item.id}
          onRowActivate={(club) => {
            router.push(`/activities/clubs/${club.id}`);
          }}
          fillHeight
          emptyState={
            <EmptyState
              icon={<Users aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
              // The header already carries the primary "add"; this one
              // only repeats it where the reader is looking.
              action={
                canManage ? (
                  <Button
                    variant="secondary"
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

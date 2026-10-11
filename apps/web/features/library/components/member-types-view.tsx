"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatCurrency } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  RowActionsMenu,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type LibraryMemberType,
  useDeleteLibraryMemberTypeMutation,
  useLibraryMemberTypesQuery,
} from "../members-api";

import { LibraryWorkspaceNav } from "./library-workspace-nav";
import { MemberTypeForm } from "./member-type-form";

/** Manage member types: loan limits, renewal, fine rule, suspension, and validity per type. */
export function MemberTypesView({ embedded = false }: { embedded?: boolean }): ReactElement {
  const t = useTranslations("app.library.memberTypes");
  const tRole = useTranslations("app.library.members.roles");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_library_settings");

  const { data, isLoading } = useLibraryMemberTypesQuery();
  const deleteType = useDeleteLibraryMemberTypeMutation();
  const [editing, setEditing] = useState<LibraryMemberType | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LibraryMemberType | null>(null);

  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryMemberType>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      {
        id: "loanLimit",
        header: t("columns.loanLimit"),
        enableSorting: false,
        cell: ({ row }) =>
          t("loanLimitValue", {
            items: row.original.max_loan_items,
            days: row.original.max_loan_days,
          }),
      },
      {
        id: "renewal",
        header: t("columns.renewal"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.max_renewals === 0
            ? t("renewalNone")
            : t("renewalValue", {
                count: row.original.max_renewals,
                days: row.original.renewal_days,
              }),
      },
      {
        id: "fine",
        header: t("columns.fine"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.fine_per_tenor === 0
            ? t("fineNone")
            : t(`fineValue.${row.original.fine_type}`, {
                amount: formatCurrency(row.original.fine_per_tenor, "IDR", { locale }),
                tenor: row.original.tenor_days,
              }),
      },
      {
        id: "defaultForRole",
        header: t("columns.defaultForRole"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.default_for_role ? tRole(row.original.default_for_role) : "-",
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          canManage ? (
            <RowActionsMenu
              ariaLabel={t("rowActions", { name: row.original.name })}
              items={[
                {
                  label: t("edit"),
                  icon: <Pencil className="size-4" aria-hidden="true" />,
                  onClick: () => {
                    setEditing(row.original);
                  },
                },
                {
                  label: t("delete"),
                  icon: <Trash2 className="size-4" aria-hidden="true" />,
                  tone: "danger",
                  onClick: () => {
                    setDeleting(row.original);
                  },
                },
              ]}
            />
          ) : null,
      },
    ],
    [t, tRole, canManage, locale],
  );

  const addButton = canManage && (
    <Button
      size="sm"
      icon={<Plus />}
      onClick={() => {
        setCreating(true);
      }}
    >
      {t("addType")}
    </Button>
  );

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the table scrolls its rows internally. Embedded in
    // the settings hub the hub owns the page, so the table grows naturally.
    <div
      className={
        embedded
          ? "flex flex-col gap-6"
          : "flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6"
      }
    >
      {embedded ? (
        addButton && <div className="flex justify-end">{addButton}</div>
      ) : (
        <>
          <PageHeader eyebrow={t("eyebrow")} title={t("title")} actions={addButton} />
          <LibraryWorkspaceNav area="settings" />
        </>
      )}

      <div className={embedded ? "flex flex-col" : "flex flex-col md:min-h-0 md:flex-1"}>
        <DataTable
          stateKey="features/library/components/member-types-view:1"
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
          fillHeight={!embedded}
          emptyState={
            <EmptyState
              icon={<domainIcons.users aria-hidden="true" />}
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
        <DialogContent title={t("addType")}>
          {creating && (
            <MemberTypeForm
              memberType={null}
              onDone={() => {
                setCreating(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent title={t("editType")}>
          {editing && (
            <MemberTypeForm
              memberType={editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("deleteTitle")}
        description={deleting ? t("deleteBody", { name: deleting.name }) : ""}
        destructive
        confirming={deleteType.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteType.mutateAsync(deleting.id);
            toast.success(t("deleted"));
            setDeleting(null);
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

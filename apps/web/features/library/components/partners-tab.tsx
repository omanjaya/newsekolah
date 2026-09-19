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
  IconButton,
  Input,
  Switch,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type LibraryPartner,
  type LibraryPartnerWrite,
  useCreateLibraryPartnerMutation,
  useDeleteLibraryPartnerMutation,
  useLibraryPartnersQuery,
  useUpdateLibraryPartnerMutation,
} from "../master-data-api";

/** Donor and vendor partners, recorded on a copy to say who it came from. */
export function PartnersTab(): ReactElement {
  const t = useTranslations("app.library.masterData.partners");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_library_catalog");

  const { data, isLoading } = useLibraryPartnersQuery();
  const deletePartner = useDeleteLibraryPartnerMutation();
  const [editing, setEditing] = useState<LibraryPartner | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LibraryPartner | null>(null);

  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryPartner>[]>(
    () => [
      { accessorKey: "code", header: t("columns.code"), enableSorting: false },
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      {
        id: "contact",
        header: t("columns.contact"),
        enableSorting: false,
        cell: ({ row }) =>
          [row.original.contact_name, row.original.phone].filter(Boolean).join(" - ") || "-",
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? "accent" : "neutral"}>
            {row.original.is_active ? t("active") : t("inactive")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          canManage ? (
            <div className="flex gap-2">
              <IconButton
                icon={<Pencil />}
                aria-label={t("edit")}
                onClick={() => {
                  setEditing(row.original);
                }}
              />
              <IconButton
                icon={<Trash2 />}
                aria-label={t("delete")}
                onClick={() => {
                  setDeleting(row.original);
                }}
              />
            </div>
          ) : null,
      },
    ],
    [t, canManage],
  );

  return (
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
      <div className="flex justify-end">
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
          stateKey="features/library/components/partners-tab:1"
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
              icon={<domainIcons.library aria-hidden="true" />}
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
            <PartnerForm
              partner={null}
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
        <DialogContent title={t("editTitle")}>
          {editing && (
            <PartnerForm
              partner={editing}
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
        confirming={deletePartner.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deletePartner.mutateAsync(deleting.id);
            toast.success(t("deleted"));
            setDeleting(null);
          } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
              toast.error(t("stillInUse"));
              return;
            }
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          }
        }}
      />
    </div>
  );
}

function PartnerForm({
  partner,
  onDone,
}: {
  partner: LibraryPartner | null;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.library.masterData.partners.form");
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateLibraryPartnerMutation();
  const update = useUpdateLibraryPartnerMutation();

  const [code, setCode] = useState(partner?.code ?? "");
  const [name, setName] = useState(partner?.name ?? "");
  const [contactName, setContactName] = useState(partner?.contact_name ?? "");
  const [phone, setPhone] = useState(partner?.phone ?? "");
  const [address, setAddress] = useState(partner?.address ?? "");
  const [isActive, setIsActive] = useState(partner?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(String(partner?.sort_order ?? 0));
  const [error, setError] = useState("");

  const mutation = partner ? update : create;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        const body: LibraryPartnerWrite = {
          code: code.trim(),
          name: name.trim(),
          contact_name: contactName.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          is_active: isActive,
          sort_order: Number(sortOrder) || 0,
        };
        const onError = (err: unknown) => {
          setError(
            err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
          );
        };
        if (partner) {
          update.mutate({ id: partner.id, ...body }, { onSuccess: onDone, onError });
        } else {
          create.mutate(body, { onSuccess: onDone, onError });
        }
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("code")}</span>
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
          required
          maxLength={20}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("name")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
          maxLength={150}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("contactName")}</span>
        <Input
          value={contactName}
          onChange={(e) => {
            setContactName(e.target.value);
          }}
          maxLength={100}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("phone")}</span>
        <Input
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
          }}
          maxLength={30}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("address")}</span>
        <Input
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
          }}
          maxLength={255}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("sortOrder")}</span>
        <Input
          type="number"
          value={sortOrder}
          onChange={(e) => {
            setSortOrder(e.target.value);
          }}
        />
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        <span className="font-medium">{t("isActive")}</span>
      </label>
      {error && <p className="text-[13px] text-status-absent">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={mutation.isPending} disabled={!code.trim() || !name.trim()}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

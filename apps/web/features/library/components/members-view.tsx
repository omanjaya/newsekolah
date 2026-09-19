"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  Select,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useCan } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type LibraryMember,
  type LibraryMemberStatus,
  useLibraryMemberTypesQuery,
  useLibraryMembersQuery,
} from "../members-api";

import { MemberBulkRegisterDialog } from "./member-bulk-register-dialog";
import { MemberRegisterForm } from "./member-register-form";

const STATUSES: LibraryMemberStatus[] = ["pending", "active", "inactive", "suspended", "cleared"];

export function MembersView(): ReactElement {
  const t = useTranslations("app.library.members");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const canManage = useCan("manage_library_members");

  const [status, setStatus] = useRememberedViewState<LibraryMemberStatus | "">(
    "members-status",
    "",
  );
  const [memberTypeId, setMemberTypeId] = useRememberedViewState("members-type", "");
  const [search, setSearch] = useRememberedViewState("members-search", "");
  const [registering, setRegistering] = useState(false);
  const [bulkRegistering, setBulkRegistering] = useState(false);

  const { data, isLoading } = useLibraryMembersQuery({ status, memberTypeId, search, limit: 200 });
  const memberTypes = useLibraryMemberTypesQuery();
  const directory = useDirectoryQuery();
  const directoryMap = useLookup(directory.data?.data);
  const memberTypeMap = useLookup(memberTypes.data?.data);

  const items = data?.data ?? [];
  const isFiltered = status !== "" || memberTypeId !== "" || search !== "";

  const typeOptions = (memberTypes.data?.data ?? []).map((mt) => ({
    value: mt.id,
    label: mt.name,
  }));

  const columns = useMemo<ColumnDef<LibraryMember>[]>(
    () => [
      {
        id: "name",
        header: t("columns.name"),
        enableSorting: false,
        cell: ({ row }) => {
          const name = directoryMap.get(row.original.user_id)?.name ?? t("unknownUser");
          return (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar size="sm" name={name} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-fg">{name}</span>
                <span className="truncate text-[12px] text-fg-muted">{row.original.member_no}</span>
              </div>
            </div>
          );
        },
      },
      {
        id: "type",
        header: t("columns.type"),
        enableSorting: false,
        cell: ({ row }) => memberTypeMap.get(row.original.member_type_id)?.name ?? "-",
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "accent" : "neutral"}>
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: "validUntil",
        header: t("columns.validUntil"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.valid_until ? formatDate(row.original.valid_until, { locale }) : "-",
      },
      {
        id: "lateReturns",
        header: t("columns.lateReturns"),
        enableSorting: false,
        cell: ({ row }) => row.original.late_return_count,
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            href={`/library/members/${row.original.user_id}`}
            className="text-[13px] font-medium text-accent hover:underline"
          >
            {t("viewDetail")}
          </Link>
        ),
      },
    ],
    [t, locale, directoryMap, memberTypeMap],
  );

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the table scrolls its rows internally while the
    // filter row and header actions stay put. See school/users-view.tsx for
    // the reference pattern.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canManage && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setBulkRegistering(true);
                }}
              >
                {t("bulkRegister.title")}
              </Button>
              <Button
                size="sm"
                icon={<Plus />}
                onClick={() => {
                  setRegistering(true);
                }}
              >
                {t("register")}
              </Button>
            </div>
          )
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("filters.status")}</span>
          <Select
            options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
            value={status}
            onValueChange={(v) => {
              setStatus(v as LibraryMemberStatus);
            }}
            placeholder={t("filters.statusAll")}
            className="w-44"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("filters.type")}</span>
          <Select
            options={typeOptions}
            value={memberTypeId}
            onValueChange={setMemberTypeId}
            placeholder={t("filters.typeAll")}
            className="w-48"
          />
        </label>
        {(status !== "" || memberTypeId !== "") && (
          <button
            type="button"
            className="text-[13px] text-accent underline underline-offset-2"
            onClick={() => {
              setStatus("");
              setMemberTypeId("");
            }}
          >
            {t("filters.clear")}
          </button>
        )}
      </div>

      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/library/components/members-view:1"
          data={items}
          columns={columns}
          rowCount={items.length}
          pagination={{ pageIndex: 0, pageSize: 200 }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
          isLoading={isLoading}
          getRowId={(item) => item.user_id}
          fillHeight
          emptyState={
            <EmptyState
              icon={<UsersRound aria-hidden="true" />}
              title={isFiltered ? t("noMatchTitle") : t("emptyTitle")}
              description={isFiltered ? t("noMatchBody") : t("emptyBody")}
            />
          }
        />
      </div>

      <Dialog
        open={registering}
        onOpenChange={(open) => {
          setRegistering(open);
        }}
      >
        <DialogContent title={t("register")}>
          {registering && (
            <MemberRegisterForm
              onDone={(registered) => {
                setRegistering(false);
                if (registered) toast.success(t("registered"));
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <MemberBulkRegisterDialog open={bulkRegistering} onOpenChange={setBulkRegistering} />
    </div>
  );
}

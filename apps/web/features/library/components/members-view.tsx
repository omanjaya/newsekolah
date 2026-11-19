"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  FilteredEmptyState,
  RowActionsMenu,
  selectionColumn,
  useToast,
  type DataTableFilterDef,
  type PageHeaderAction,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { CreditCard, GraduationCap, Plus, Printer, Users, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { cloneElement, useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useOffsetPage } from "../../../lib/hooks/use-offset-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import { useLookup } from "../../reference/api";
import { useDirectoryNames } from "../../reference/directory-names";
import { studentProfileHref } from "../../students/href";
import { printMemberCard } from "../api";
import { formatShortDay } from "../lib/short-date";
import { MEMBER_STATUS_TONE, toneOf } from "../lib/status-tones";
import {
  type LibraryMember,
  type LibraryMemberStatus,
  printLibraryMemberCardsBatch,
  useLibraryMemberTypesQuery,
  useLibraryMembersQuery,
} from "../members-api";
import { useOrderedSelection } from "../use-ordered-selection";

import { useLibraryShortcuts } from "./library-workspace-nav";
import { MemberBulkRegisterDialog } from "./member-bulk-register-dialog";
import { MemberCardPrintAction } from "./member-card-print-bar";
import { MemberRegisterForm } from "./member-register-form";

const STATUSES: LibraryMemberStatus[] = ["pending", "active", "inactive", "suspended", "cleared"];
const STATUS_VALUES = ["", ...STATUSES] as const;
/** Rows per page; the members API pages by offset and reports no total. */
const MEMBERS_PAGE_SIZE = 50;

export function MembersView(): ReactElement {
  const t = useTranslations("app.library.members");
  const tMemberCards = useTranslations("app.library.memberCards");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const toast = useToast();
  const canManage = useCan("manage_library_members");
  const shortcuts = useLibraryShortcuts(["memberTypes", { report: "members" }]);

  const [status, setStatus] = useUrlState<(typeof STATUS_VALUES)[number]>(
    "status",
    STATUS_VALUES,
    "",
  );
  const [memberTypeId, setMemberTypeId] = useUrlState<string>("member_type", () => true, "");
  const [search, setSearch] = useRememberedViewState("members-search", "");
  const [registering, setRegistering] = useState(false);
  const [bulkRegistering, setBulkRegistering] = useState(false);
  const [printingFiltered, setPrintingFiltered] = useState(false);
  const { selection, onSelectionChange, orderedIds } = useOrderedSelection();
  const apiErrorMessage = useApiErrorMessage();

  // The list API has no total count, so paging is prev/next by offset and
  // "next" is available while the last page came back full.
  const paging = useOffsetPage(MEMBERS_PAGE_SIZE);
  const { data, isLoading, error, refetch, isRefetching } = useLibraryMembersQuery({
    status,
    memberTypeId,
    search,
    limit: paging.limit,
    offset: paging.offset,
  });
  const memberTypes = useLibraryMemberTypesQuery();
  const memberTypeMap = useLookup(memberTypes.data?.data);

  const items = data?.data ?? [];
  const directoryMap = useDirectoryNames(items.map((item) => item.user_id));
  const isFiltered = status !== "" || memberTypeId !== "" || search !== "";

  const typeOptions = (memberTypes.data?.data ?? []).map((mt) => ({
    value: mt.id,
    label: mt.name,
  }));

  const filters: DataTableFilterDef[] = [
    {
      id: "status",
      label: t("filters.status"),
      value: status,
      onChange: (value) => {
        setStatus(value as (typeof STATUS_VALUES)[number]);
        paging.resetPage();
      },
      options: STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
    },
    {
      id: "type",
      label: t("filters.type"),
      value: memberTypeId,
      onChange: paging.resetting(setMemberTypeId),
      options: typeOptions,
    },
  ];

  const columns = useMemo<ColumnDef<LibraryMember>[]>(
    () => [
      selectionColumn<LibraryMember>(),
      {
        id: "name",
        header: t("columns.name"),
        enableSorting: false,
        meta: { card: "title", skeleton: "avatar" },
        cell: ({ row }) => {
          const name = directoryMap.get(row.original.user_id)?.name ?? t("unknownUser");
          return (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar size={32} name={name} decorative />
              <div className="flex min-w-0 flex-col">
                {/* Body text, as in the other areas' tables: the row opens the member. */}
                <span className="truncate font-semibold text-fg">{name}</span>
                <span className="truncate text-caption text-fg-muted">
                  {row.original.member_no}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        // On a phone the card is as compact as a user card: type, status,
        // validity and any late returns share one unlabelled meta line.
        id: "type",
        header: t("columns.type"),
        enableSorting: false,
        meta: { card: "meta" },
        cell: ({ row }) => memberTypeMap.get(row.original.member_type_id)?.name ?? "-",
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        // The normal state is quiet text, as in the users table; a badge
        // marks only the exceptions (pending, suspended, cleared...).
        cell: ({ row }) =>
          row.original.status === "active" ? (
            <span className="text-fg-muted">{t("status.active")}</span>
          ) : (
            <Badge tone={toneOf(MEMBER_STATUS_TONE, row.original.status)}>
              {t(`status.${row.original.status}`)}
            </Badge>
          ),
      },
      {
        id: "validUntil",
        header: t("columns.validUntil"),
        enableSorting: false,
        meta: { card: "meta" },
        // Unlabelled on the card, so it says what the date is there; no
        // date is a dash in the table and nothing on the card.
        cell: ({ row }) => {
          if (!row.original.valid_until) return <span className="max-md:hidden">-</span>;
          const date = formatShortDay(row.original.valid_until, locale);
          return (
            <>
              <span className="max-md:hidden">{date}</span>
              <span className="md:hidden">{t("cardValidUntil", { date })}</span>
            </>
          );
        },
      },
      {
        // Past loans returned late, not current lateness: a dash for none.
        id: "lateReturns",
        header: t("columns.lateReturns"),
        enableSorting: false,
        meta: { align: "end", card: "meta", skeleton: "badge" },
        cell: ({ row }) => {
          const count = row.original.late_return_count;
          if (count === 0) return <span className="text-fg-muted max-md:hidden">-</span>;
          return (
            <Badge tone="warning">
              <span className="max-md:hidden">{count}</span>
              <span className="md:hidden">{t("cardLateReturns", { count })}</span>
            </Badge>
          );
        },
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => {
          const name = directoryMap.get(row.original.user_id)?.name ?? t("unknownUser");
          return (
            <MemberRowActionsMenu
              userId={row.original.user_id}
              memberName={name}
              isStudent={directoryMap.get(row.original.user_id)?.profile_kind === "student"}
            />
          );
        },
      },
    ],
    [t, locale, directoryMap, memberTypeMap],
  );

  const secondaryActions: PageHeaderAction[] = [
    ...(canManage
      ? [
          {
            label: t("bulkRegister.title"),
            icon: <Users />,
            onSelect: () => {
              setBulkRegistering(true);
            },
          },
        ]
      : []),
    ...shortcuts,
  ];
  const registerButton = canManage ? (
    <Button
      icon={<Plus />}
      onClick={() => {
        setRegistering(true);
      }}
    >
      {t("register")}
    </Button>
  ) : undefined;

  return (
    <AppPage
      variant="fit"
      nav={false}
      primaryAction={registerButton}
      primaryActionCompact={
        canManage
          ? {
              icon: <Plus />,
              label: t("register"),
              onSelect: () => {
                setRegistering(true);
              },
            }
          : undefined
      }
      secondaryActions={secondaryActions}
    >
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/library/components/members-view:1"
          data={items}
          mode="cursor"
          columns={columns}
          rowCount={items.length}
          cursorPagination={{
            hasPrevious: paging.hasPrevious,
            hasNext: paging.hasNextFor(items.length),
            onPrevious: paging.goPrevious,
            onNext: paging.goNext,
            page: paging.page,
            pageSize: paging.limit,
          }}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter={search}
          onGlobalFilterChange={paging.resetting(setSearch)}
          toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
          filters={filters}
          toolbarActions={
            memberTypeId !== "" ? (
              <Button
                variant="secondary"
                icon={<CreditCard />}
                loading={printingFiltered}
                onClick={() => {
                  setPrintingFiltered(true);
                  printLibraryMemberCardsBatch({ memberTypeId })
                    .catch((failure: unknown) => {
                      toast.error(
                        failure instanceof ApiError
                          ? apiErrorMessage(failure.code)
                          : apiErrorMessage("UNKNOWN"),
                      );
                    })
                    .finally(() => {
                      setPrintingFiltered(false);
                    });
                }}
              >
                {tMemberCards("printFiltered")}
              </Button>
            ) : undefined
          }
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          retrying={isRefetching}
          rowSelection={selection}
          onRowSelectionChange={onSelectionChange}
          bulkActions={<MemberCardPrintAction selectedIds={orderedIds} />}
          getRowId={(item) => item.user_id}
          onRowActivate={(item) => {
            router.push(`/library/members/${item.user_id}`);
          }}
          fillHeight
          emptyState={
            isFiltered ? (
              <FilteredEmptyState
                title={t("noMatchTitle")}
                description={t("noMatchBody")}
                onReset={() => {
                  setStatus("");
                  setMemberTypeId("");
                  setSearch("");
                  paging.resetPage();
                }}
              />
            ) : (
              <EmptyState
                icon={<UsersRound aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
                action={registerButton && cloneElement(registerButton, { variant: "secondary" })}
              />
            )
          }
        />
      </div>

      <Dialog
        open={registering}
        onOpenChange={(open) => {
          setRegistering(open);
        }}
      >
        <DialogContent title={t("register")} size="md">
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
    </AppPage>
  );
}

/**
 * A member row's secondary actions behind one "..." button: printing the
 * card and, for a student, their school profile. The name itself opens
 * the member's library page.
 */
function MemberRowActionsMenu({
  userId,
  memberName,
  isStudent,
}: {
  userId: string;
  memberName: string;
  isStudent: boolean;
}): ReactElement {
  const t = useTranslations("app.library.members");
  const tHistory = useTranslations("app.library.memberHistory");
  const router = useRouter();

  return (
    <RowActionsMenu
      ariaLabel={t("rowActions", { member: memberName })}
      items={[
        {
          label: tHistory("printCard"),
          icon: <Printer className="size-4" aria-hidden="true" />,
          onClick: () => {
            void printMemberCard(userId);
          },
        },
        ...(isStudent
          ? [
              {
                label: t("studentProfile"),
                icon: <GraduationCap className="size-4" aria-hidden="true" />,
                onClick: () => {
                  router.push(studentProfileHref(userId, "library"));
                },
              },
            ]
          : []),
      ]}
    />
  );
}

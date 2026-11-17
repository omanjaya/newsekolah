"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Avatar,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  FilteredEmptyState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useOffsetPage } from "../../../lib/hooks/use-offset-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryNames } from "../../reference/directory-names";
import { StudentLink } from "../../students/components/student-link";
import { type Counseling } from "../api";
import { useDeleteCounselingMutation, useMyCounselingsQuery } from "../api-counseling-extras";

import { CounselingBKTeamPanel } from "./counseling-bk-team-panel";
import { CounselingDetailDialog } from "./counseling-detail-dialog";
import { CounselingForm } from "./counseling-form";

/** Rows per page; the counseling API pages by offset and reports no total. */
const PAGE_SIZE = 50;

export function CounselingView(): ReactElement {
  const t = useTranslations("app.discipline.counseling");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_counseling");
  const searchParams = useSearchParams();
  const initialStudentId = searchParams.get("studentId") ?? undefined;

  const [search, setSearch] = useUrlState<string>("mine_q", () => true, "");
  const paging = useOffsetPage(PAGE_SIZE, "mine_page");
  const { data, isLoading, error, refetch } = useMyCounselingsQuery({
    limit: paging.limit,
    offset: paging.offset,
    search,
  });
  const remove = useDeleteCounselingMutation();

  const [editing, setEditing] = useState<Counseling | "new" | null>(() =>
    canManage && initialStudentId ? "new" : null,
  );
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Counseling | null>(null);
  const [tab, setTab] = useUrlState<string>("tab", ["mine", "bkTeam"], "mine");

  const items = data?.data ?? [];
  const studentMap = useDirectoryNames(items.map((item) => item.student_user_id));

  const columns = useMemo<ColumnDef<Counseling>[]>(
    () => [
      { accessorKey: "title", header: t("columns.title"), enableSorting: false },
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        cell: ({ row }) => {
          const student = studentMap.get(row.original.student_user_id);
          return student ? (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar size={32} name={student.name} />
              <span className="truncate">
                <StudentLink studentId={student.id} tab="counseling">
                  {student.name}
                </StudentLink>
              </span>
            </div>
          ) : (
            t("unknownStudent")
          );
        },
      },
      {
        id: "date",
        header: t("columns.date"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.session_at, { locale }),
      },
      {
        id: "kind",
        header: t("columns.kind"),
        enableSorting: false,
        cell: ({ row }) => t(`form.kindOptions.${row.original.kind}`),
      },
    ],
    [t, locale, studentMap],
  );

  return (
    // No title or eyebrow of its own: the area's header (h1 "Konseling BK")
    // stays put between its tabs, and the current tab names this page.
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
    >
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col md:min-h-0 md:flex-1">
        <TabsList>
          <TabsTrigger value="mine">{t("tabs.mine")}</TabsTrigger>
          <TabsTrigger value="bkTeam">{t("tabs.bkTeam")}</TabsTrigger>
        </TabsList>
        <TabsContent value="mine" className="pt-4 md:min-h-0 md:flex-1">
          <div className="flex flex-col md:h-full md:min-h-0">
            <DataTable
              stateKey="features/discipline/components/counseling-view:1"
              mode="cursor"
              data={items}
              columns={columns}
              rowCount={items.length}
              pagination={{ pageIndex: 0, pageSize: PAGE_SIZE }}
              onPaginationChange={() => undefined}
              cursorPagination={{
                hasPrevious: paging.hasPrevious,
                hasNext: paging.hasNextFor(items.length),
                onPrevious: paging.goPrevious,
                onNext: paging.goNext,
                page: paging.page,
                pageSize: paging.limit,
              }}
              error={error}
              onRetry={() => void refetch()}
              sorting={[]}
              onSortingChange={() => undefined}
              globalFilter={search}
              onGlobalFilterChange={paging.resetting(setSearch)}
              toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
              isLoading={isLoading}
              getRowId={(item) => item.id}
              onRowActivate={(item) => {
                setViewingId(item.id);
              }}
              fillHeight
              emptyState={
                search !== "" ? (
                  <FilteredEmptyState
                    onReset={() => {
                      paging.resetting(setSearch)("");
                    }}
                  />
                ) : (
                  <EmptyState
                    icon={<domainIcons.users aria-hidden="true" />}
                    title={t("emptyTitle")}
                    description={t("emptyBody")}
                    // The header carries the primary; the empty list repeats it quietly.
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
                )
              }
            />
          </div>
        </TabsContent>
        <TabsContent value="bkTeam" className="pt-4 md:min-h-0 md:flex-1">
          <CounselingBKTeamPanel
            onOpen={(id) => {
              setViewingId(id);
            }}
          />
        </TabsContent>
      </Tabs>

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
            <CounselingForm
              initial={editing === "new" ? undefined : editing}
              initialStudentId={initialStudentId}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <CounselingDetailDialog
        counselingId={viewingId}
        onClose={() => {
          setViewingId(null);
        }}
        onEdit={() => {
          const current = items.find((item) => item.id === viewingId);
          if (current) setEditing(current);
          setViewingId(null);
        }}
        onDelete={() => {
          const current = items.find((item) => item.id === viewingId);
          if (current) setPendingDelete(current);
          setViewingId(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("deleteTitle")}
        description={pendingDelete ? t("deleteBody", { title: pendingDelete.title }) : ""}
        confirmLabel={t("deleteConfirm")}
        tone="danger"
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            toast.success(t("deleted"));
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    </AppPage>
  );
}

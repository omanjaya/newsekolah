"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Select,
  DatePicker,
  DialogFooter,
  Field,
  Avatar,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  Textarea,
  useToast,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { useClassesQuery } from "../../reference/api";
import { useDirectoryName } from "../../reference/directory-names";
import {
  type Achievement,
  type AchievementLevel,
  type AchievementWrite,
  useAchievementsQuery,
  useCreateAchievementMutation,
  useUpdateAchievementMutation,
  useDeleteAchievementMutation,
} from "../api";

import { StudentPicker } from "./student-picker";

function AchievementStudentCell({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.activities.students");
  const name = useDirectoryName(id)?.name ?? t("unknown");
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar size={32} name={name} />
      <span className="truncate text-fg">{name}</span>
    </div>
  );
}

const LEVELS: AchievementLevel[] = [
  "school",
  "district",
  "city",
  "province",
  "national",
  "international",
];

export function AchievementsView(): ReactElement {
  const tNav = useTranslations("app.activities");
  const tShell = useTranslations("app.shell.nav.items");
  const t = useTranslations("app.activities.achievements");
  const canManage = useCan("manage_achievements");
  const [classId, setClassId] = useUrlState<string>("class_id", () => true, "");
  const { data, isLoading, error, refetch } = useAchievementsQuery(undefined, classId || undefined);
  const classes = useClassesQuery();
  const [editing, setEditing] = useState<Achievement | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Achievement | null>(null);
  const remove = useDeleteAchievementMutation();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const achievements = data?.data ?? [];
  const classOptions = (classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  const filters: DataTableFilterDef[] = [
    {
      id: "class",
      label: t("filters.class"),
      value: classId,
      onChange: setClassId,
      options: classOptions,
    },
  ];

  const columns = useMemo<ColumnDef<Achievement>[]>(
    () => [
      {
        accessorKey: "student_user_id",
        header: t("columns.student"),
        enableSorting: false,
        cell: ({ row }) => <AchievementStudentCell id={row.original.student_user_id} />,
      },
      { accessorKey: "competition_name", header: t("columns.competition"), enableSorting: false },
      {
        accessorKey: "level",
        header: t("columns.level"),
        enableSorting: false,
        cell: ({ row }) => t(`levels.${row.original.level}`),
      },
      { accessorKey: "placement", header: t("columns.placement"), enableSorting: false },
      { accessorKey: "achieved_on", header: t("columns.date"), enableSorting: false },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          canManage ? (
            <div className="flex justify-end gap-2">
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
          ) : null,
      },
    ],
    [t, canManage],
  );

  return (
    <AppPage
      variant="fit"
      title={tNav("navLabelAchievements")}
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
    >
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/activities/components/achievements-view:1"
          mode="local"
          data={achievements}
          columns={columns}
          rowCount={achievements.length}
          pagination={{ pageIndex: 0, pageSize: 50 }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter=""
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
              icon={<Trophy aria-hidden="true" />}
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
        <DialogContent title={editing === "new" ? t("form.title") : t("form.editTitle")}>
          {editing !== null && (
            <AchievementForm
              key={editing === "new" ? "new" : editing.id}
              initial={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
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

function AchievementForm({
  initial,
  onDone,
}: {
  initial?: Achievement;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.activities.achievements.form");
  const tAchievements = useTranslations("app.activities.achievements");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateAchievementMutation();
  const update = useUpdateAchievementMutation();
  const { me } = useSession();

  const [studentId, setStudentId] = useState(initial?.student_user_id ?? "");
  const [competitionName, setCompetitionName] = useState(initial?.competition_name ?? "");
  const [level, setLevel] = useState<AchievementLevel>(initial?.level ?? "school");
  const [placement, setPlacement] = useState(initial?.placement ?? "");
  const [achievedOn, setAchievedOn] = useState(
    initial?.achieved_on ?? todayInZone(me?.tenant.timezone),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body: AchievementWrite = {
          student_user_id: studentId.trim(),
          competition_name: competitionName.trim(),
          level,
          placement: placement.trim(),
          achieved_on: achievedOn,
          notes: notes.trim() || undefined,
        };
        const callbacks = {
          onSuccess: () => {
            toast.success(tAchievements("saved"));
            onDone();
          },
          onError: (error: unknown) => {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        };
        if (initial) update.mutate({ id: initial.id, ...body }, callbacks);
        else create.mutate(body, callbacks);
      }}
    >
      <Field label={t("studentId")}>
        <StudentPicker value={studentId} onChange={setStudentId} />
      </Field>
      <Field label={t("competitionName")}>
        <Input
          value={competitionName}
          onChange={(e) => {
            setCompetitionName(e.target.value);
          }}
          required
          maxLength={200}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("level")}>
          <Select
            value={level}
            onValueChange={(next) => {
              setLevel(next as AchievementLevel);
            }}
            options={LEVELS.map((lvl) => ({ value: lvl, label: tAchievements(`levels.${lvl}`) }))}
          />
        </Field>
        <Field label={t("placement")}>
          <Input
            value={placement}
            onChange={(e) => {
              setPlacement(e.target.value);
            }}
            required
            maxLength={100}
          />
        </Field>
      </div>
      <Field label={t("achievedOn")}>
        <DatePicker value={achievedOn} required onChange={setAchievedOn} />
      </Field>
      <Field label={t("notes")}>
        <Textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          maxLength={1000}
          rows={2}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={!studentId} loading={create.isPending || update.isPending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Avatar,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  PageHeader,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryQuery } from "../../reference/api";
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
  const directory = useDirectoryQuery("student");
  const name = directory.data?.data.find((student) => student.id === id)?.name ?? t("unknown");
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar size="sm" name={name} />
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
  const t = useTranslations("app.activities.achievements");
  const canManage = useCan("manage_achievements");
  const { data, isLoading } = useAchievementsQuery();
  const [editing, setEditing] = useState<Achievement | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Achievement | null>(null);
  const remove = useDeleteAchievementMutation();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const achievements = data?.data ?? [];

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
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the table scrolls its rows internally while the
    // actions row stays put. See school/components/users-view.tsx for the
    // reference pattern.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      {canManage && (
        <div className="flex justify-end">
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setEditing("new");
            }}
          >
            {t("add")}
          </Button>
        </div>
      )}

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
          isLoading={isLoading}
          getRowId={(item) => item.id}
          fillHeight
          emptyState={
            <EmptyState
              icon={<Trophy aria-hidden="true" />}
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
    </div>
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

  const [studentId, setStudentId] = useState(initial?.student_user_id ?? "");
  const [competitionName, setCompetitionName] = useState(initial?.competition_name ?? "");
  const [level, setLevel] = useState<AchievementLevel>(initial?.level ?? "school");
  const [placement, setPlacement] = useState(initial?.placement ?? "");
  const [achievedOn, setAchievedOn] = useState(
    initial?.achieved_on ?? new Date().toISOString().slice(0, 10),
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
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("studentId")}</span>
        <StudentPicker value={studentId} onChange={setStudentId} />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("competitionName")}</span>
        <Input
          value={competitionName}
          onChange={(e) => {
            setCompetitionName(e.target.value);
          }}
          required
          maxLength={200}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("level")}</span>
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
            value={level}
            onChange={(e) => {
              setLevel(e.target.value as AchievementLevel);
            }}
          >
            {LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {tAchievements(`levels.${lvl}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("placement")}</span>
          <Input
            value={placement}
            onChange={(e) => {
              setPlacement(e.target.value);
            }}
            required
            maxLength={100}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("achievedOn")}</span>
        <Input
          type="date"
          value={achievedOn}
          onChange={(e) => {
            setAchievedOn(e.target.value);
          }}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("notes")}</span>
        <Textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          maxLength={1000}
          rows={2}
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={!studentId} loading={create.isPending || update.isPending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

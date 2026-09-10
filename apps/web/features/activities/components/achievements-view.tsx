"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
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
import {
  type Achievement,
  type AchievementLevel,
  type AchievementWrite,
  useAchievementsQuery,
  useCreateAchievementMutation,
} from "../api";

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
  const [creating, setCreating] = useState(false);

  const achievements = data?.data ?? [];

  const columns = useMemo<ColumnDef<Achievement>[]>(
    () => [
      { accessorKey: "student_user_id", header: t("columns.student"), enableSorting: false },
      { accessorKey: "competition_name", header: t("columns.competition"), enableSorting: false },
      {
        accessorKey: "level",
        header: t("columns.level"),
        enableSorting: false,
        cell: ({ row }) => t(`levels.${row.original.level}`),
      },
      { accessorKey: "placement", header: t("columns.placement"), enableSorting: false },
      { accessorKey: "achieved_on", header: t("columns.date"), enableSorting: false },
    ],
    [t],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      {canManage && (
        <div className="flex justify-end">
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setCreating(true);
            }}
          >
            {t("add")}
          </Button>
        </div>
      )}

      <DataTable
        data={achievements}
        columns={columns}
        rowCount={achievements.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
        isLoading={isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<Trophy aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("form.title")}>
          <AchievementForm
            onDone={() => {
              setCreating(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AchievementForm({ onDone }: { onDone: () => void }): ReactElement {
  const t = useTranslations("app.activities.achievements.form");
  const tAchievements = useTranslations("app.activities.achievements");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateAchievementMutation();

  const [studentId, setStudentId] = useState("");
  const [competitionName, setCompetitionName] = useState("");
  const [level, setLevel] = useState<AchievementLevel>("school");
  const [placement, setPlacement] = useState("");
  const [achievedOn, setAchievedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

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
        create.mutate(body, {
          onSuccess: () => {
            toast.success(tAchievements("saved"));
            onDone();
          },
          onError: (error) => {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        });
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("studentId")}</span>
        <Input
          value={studentId}
          onChange={(e) => {
            setStudentId(e.target.value);
          }}
          required
        />
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
        <Button type="submit" loading={create.isPending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

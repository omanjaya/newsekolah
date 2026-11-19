"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate, type Locale } from "@newsekolah/i18n";
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
  RowActionsMenu,
  Textarea,
  useToast,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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

/**
 * The students' achievements of the year, a tab of the student activities
 * area (its title and group come from the navigation), filtered by class.
 */
export function AchievementsView(): ReactElement {
  const t = useTranslations("app.activities.achievements");
  const locale = useLocale() as Locale;
  const [search, setSearch] = useState("");
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
      {
        accessorKey: "achieved_on",
        header: t("columns.date"),
        enableSorting: false,
        // A calendar date ("2026-11-17"), read in UTC so it stays that day.
        cell: ({ row }) => formatDate(row.original.achieved_on, { locale, timeZone: "UTC" }),
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: t("columns.actions"),
              enableSorting: false,
              cell: ({ row }: { row: { original: Achievement } }) => (
                <RowActionsMenu
                  ariaLabel={t("rowActions", { name: row.original.competition_name })}
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
            } satisfies ColumnDef<Achievement>,
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
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          filters={filters}
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
              // The header already carries the primary "add".
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
  // Required fields are marked on their labels and checked on submit, so
  // Simpan stays enabled and a missing value is named under its field.
  const [attempted, setAttempted] = useState(false);
  const errors = {
    student: studentId === "" ? t("errors.student") : undefined,
    competitionName: competitionName.trim() === "" ? t("errors.competitionName") : undefined,
    placement: placement.trim() === "" ? t("errors.placement") : undefined,
    achievedOn: achievedOn === "" ? t("errors.achievedOn") : undefined,
  };
  const valid = Object.values(errors).every((error) => error === undefined);
  const shown = (error: string | undefined) => (attempted ? error : undefined);
  const pending = create.isPending || update.isPending;

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (!valid || pending) return;
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
      <Field label={t("studentId")} required error={shown(errors.student)}>
        <StudentPicker value={studentId} onChange={setStudentId} />
      </Field>
      <Field label={t("competitionName")} required error={shown(errors.competitionName)}>
        <Input
          value={competitionName}
          onChange={(e) => {
            setCompetitionName(e.target.value);
          }}
          maxLength={200}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("level")} required>
          <Select
            value={level}
            onValueChange={(next) => {
              setLevel(next as AchievementLevel);
            }}
            options={LEVELS.map((lvl) => ({ value: lvl, label: tAchievements(`levels.${lvl}`) }))}
          />
        </Field>
        <Field label={t("placement")} required error={shown(errors.placement)}>
          <Input
            value={placement}
            onChange={(e) => {
              setPlacement(e.target.value);
            }}
            maxLength={100}
          />
        </Field>
      </div>
      <Field label={t("achievedOn")} required error={shown(errors.achievedOn)}>
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
        <Button type="submit" loading={pending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

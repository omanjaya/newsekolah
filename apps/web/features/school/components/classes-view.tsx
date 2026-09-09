"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useClassesQuery, useLookup, useTeachersQuery } from "../../reference/api";
import {
  type ClassRow,
  useCreateClassMutation,
  useGradeLevelsQuery,
  useUpdateClassMutation,
} from "../api";

import { EnrollmentPanel, TeachingPanel } from "./class-panels";

/** Class list on the left, the selected class's students and teachers on the right. */
export function ClassesView(): ReactElement {
  const t = useTranslations("app.school.classes");
  const year = useActiveYear();
  const canManage = useCan("manage_master_data");
  const classes = useClassesQuery();
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const items = classes.data?.data ?? [];
  const selected = items.find((c) => c.id === selectedId) ?? items[0];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canManage && (
            <Button
              size="sm"
              icon={<Plus />}
              onClick={() => {
                setCreating(true);
              }}
            >
              {t("addClass")}
            </Button>
          )
        }
      />
      {classes.isLoading ? (
        <Skeleton className="h-96 w-full" aria-busy="true" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <nav aria-label={t("title")} className="flex flex-row gap-1 overflow-x-auto md:flex-col">
            {items.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-current={selected?.id === c.id ? "true" : undefined}
                onClick={() => {
                  setSelectedId(c.id);
                }}
                className={`rounded-xs px-3 py-2 text-left text-[14px] ${selected?.id === c.id ? "bg-accent/10 text-accent" : "text-fg hover:bg-bg"}`}
              >
                {c.name}
              </button>
            ))}
          </nav>
          {selected && <ClassDetail key={selected.id} cls={selected} canManage={canManage} />}
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("addClass")}>
          {creating && (
            <ClassForm
              yearId={year.id}
              onDone={() => {
                setCreating(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClassForm({
  yearId,
  initial,
  onDone,
}: {
  yearId: string;
  initial?: ClassRow;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.school.classes.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const grades = useGradeLevelsQuery();
  const teachers = useTeachersQuery();
  const create = useCreateClassMutation();
  const update = useUpdateClassMutation();
  const [name, setName] = useState(initial?.name ?? "");
  const [gradeId, setGradeId] = useState(initial?.grade_level_id ?? "");
  const [homeroomId, setHomeroomId] = useState(initial?.homeroom_teacher_id ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : "");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!name.trim() || !gradeId) {
      setError(t("requiredError"));
      return;
    }
    const body = {
      academic_year_id: yearId,
      grade_level_id: gradeId,
      name: name.trim(),
      ...(homeroomId ? { homeroom_teacher_id: homeroomId } : {}),
      ...(capacity ? { capacity: Number(capacity) } : {}),
    };
    try {
      if (initial) await update.mutateAsync({ id: initial.id, body });
      else await create.mutateAsync(body);
      toast.success(t("saved"));
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && (
        <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("name")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="X-A"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("grade")}</span>
        <Select
          options={(grades.data?.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
          value={gradeId}
          onValueChange={setGradeId}
          placeholder={t("pick")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("homeroom")}</span>
        <Select
          options={(teachers.data?.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
          value={homeroomId}
          onValueChange={setHomeroomId}
          placeholder={t("pick")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("capacity")}</span>
        <Input
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => {
            setCapacity(e.target.value);
          }}
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending || update.isPending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

function ClassDetail({ cls, canManage }: { cls: ClassRow; canManage: boolean }): ReactElement {
  const t = useTranslations("app.school.classes");
  const year = useActiveYear();
  const teachers = useTeachersQuery();
  const teacherMap = useLookup(teachers.data?.data);
  const [editing, setEditing] = useState(false);
  return (
    <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-[18px] font-medium text-fg">{cls.name}</h2>
          <span className="text-[13px] text-fg-muted">
            {t("homeroomLabel")}:{" "}
            {cls.homeroom_teacher_id
              ? (teacherMap.get(cls.homeroom_teacher_id)?.name ?? "-")
              : t("noHomeroom")}
            {cls.capacity ? ` · ${t("capacityLabel", { n: cls.capacity })}` : ""}
          </span>
        </div>
        {canManage && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditing(true);
            }}
          >
            {t("editClass")}
          </Button>
        )}
      </div>
      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">{t("tabStudents")}</TabsTrigger>
          <TabsTrigger value="teachers">{t("tabTeachers")}</TabsTrigger>
        </TabsList>
        <TabsContent value="students" className="pt-3">
          <EnrollmentPanel classId={cls.id} canManage={canManage} />
        </TabsContent>
        <TabsContent value="teachers" className="pt-3">
          <TeachingPanel classId={cls.id} canManage={canManage} />
        </TabsContent>
      </Tabs>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={t("editClass")}>
          {editing && (
            <ClassForm
              yearId={year.id}
              initial={cls}
              onDone={() => {
                setEditing(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

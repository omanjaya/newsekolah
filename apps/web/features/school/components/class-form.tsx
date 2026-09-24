"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useTeachersQuery } from "../../reference/api";
import {
  type ClassRow,
  useCreateClassMutation,
  useGradeLevelsQuery,
  useUpdateClassMutation,
} from "../api";

export function ClassForm({
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

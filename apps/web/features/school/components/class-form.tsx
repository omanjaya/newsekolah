"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  DialogFooter,
  Field,
  FormError,
  Input,
  NumberInput,
  Select,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
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
  const homeroomLabels = useDirectoryPickerLabels(t("pick"));
  const create = useCreateClassMutation();
  const update = useUpdateClassMutation();
  const [name, setName] = useState(initial?.name ?? "");
  const [gradeId, setGradeId] = useState(initial?.grade_level_id ?? "");
  const [homeroomId, setHomeroomId] = useState(initial?.homeroom_teacher_id ?? "");
  const [capacity, setCapacity] = useState<number | null>(initial?.capacity ?? null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // The name says it is missing once the reader has left it; the grade, on save.
  const missing = submitted || touched;

  async function submit() {
    setError(null);
    setSubmitted(true);
    if (!name.trim() || !gradeId) return;
    const body = {
      academic_year_id: yearId,
      grade_level_id: gradeId,
      name: name.trim(),
      ...(homeroomId ? { homeroom_teacher_id: homeroomId } : {}),
      ...(capacity ? { capacity } : {}),
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
      {error && <FormError>{error}</FormError>}
      <Field
        label={t("name")}
        required
        error={missing && !name.trim() ? t("nameRequired") : undefined}
      >
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          onBlur={() => {
            setTouched(true);
          }}
          placeholder="X-A"
        />
      </Field>
      <Field
        label={t("grade")}
        required
        error={submitted && !gradeId ? t("gradeRequired") : undefined}
      >
        <Select
          options={(grades.data?.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
          value={gradeId}
          onValueChange={setGradeId}
          placeholder={t("pick")}
        />
      </Field>
      <Field label={t("homeroom")} optional>
        <DirectoryPicker
          profileKind="teacher"
          value={homeroomId}
          onValueChange={setHomeroomId}
          labels={homeroomLabels}
        />
      </Field>
      <Field label={t("capacity")} optional hint={t("capacityHint")}>
        <NumberInput min={1} value={capacity} onChange={setCapacity} suffix={t("capacityUnit")} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending || update.isPending}>
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery } from "../../reference/api";
import {
  type ViolationRecordResult,
  useRecordViolationMutation,
  useViolationTypesQuery,
} from "../api";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ViolationRecordForm({
  onDone,
}: {
  onDone: (result?: ViolationRecordResult) => void;
}): ReactElement {
  const t = useTranslations("app.discipline.violations.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const students = useDirectoryQuery("student");
  const types = useViolationTypesQuery();
  const record = useRecordViolationMutation();

  const [studentId, setStudentId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [occurredOn, setOccurredOn] = useState(today());
  const [notes, setNotes] = useState("");

  const studentOptions = (students.data?.data ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));
  const typeOptions = (types.data?.data ?? [])
    .filter((type) => type.is_active)
    .map((type) => ({
      value: type.id,
      label: t("typePoints", { name: type.name, points: type.points }),
    }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!studentId || !typeId) return;
        record.mutate(
          {
            student_user_id: studentId,
            violation_type_id: typeId,
            occurred_on: occurredOn,
            notes: notes.trim() || undefined,
          },
          {
            onSuccess: (result) => {
              toast.success(t("recorded"));
              onDone(result);
            },
            onError: (error) => {
              toast.error(
                error instanceof ApiError
                  ? apiErrorMessage(error.code)
                  : apiErrorMessage("UNKNOWN"),
              );
            },
          },
        );
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("student")}</span>
        <Select
          options={studentOptions}
          value={studentId}
          onValueChange={setStudentId}
          placeholder={t("studentPlaceholder")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("type")}</span>
        <Select
          options={typeOptions}
          value={typeId}
          onValueChange={setTypeId}
          placeholder={t("typePlaceholder")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("date")}</span>
        <Input
          type="date"
          value={occurredOn}
          onChange={(e) => {
            setOccurredOn(e.target.value);
          }}
          max={today()}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("notes")}</span>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          placeholder={t("notesPlaceholder")}
          maxLength={1000}
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onDone();
          }}
        >
          {t("cancel")}
        </Button>
        <Button type="submit" loading={record.isPending} disabled={!studentId || !typeId}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Checkbox, Input, Select, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery } from "../../reference/api";
import {
  type ViolationRecordResult,
  useRecordViolationMutation,
  useViolationTypesQuery,
} from "../api";

const MAX_TYPES = 50;

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
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [occurredOn, setOccurredOn] = useState(today());
  const [notes, setNotes] = useState("");

  const studentOptions = (students.data?.data ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));
  const activeTypes = (types.data?.data ?? []).filter((type) => type.is_active);
  const selectedTotal = useMemo(
    () =>
      activeTypes
        .filter((type) => typeIds.includes(type.id))
        .reduce((sum, type) => sum + type.points, 0),
    [activeTypes, typeIds],
  );

  function toggleType(id: string) {
    setTypeIds((current) => {
      if (current.includes(id)) return current.filter((v) => v !== id);
      if (current.length >= MAX_TYPES) return current;
      return [...current, id];
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!studentId || typeIds.length === 0) return;
        record.mutate(
          {
            student_user_id: studentId,
            violation_type_ids: typeIds,
            occurred_on: occurredOn,
            notes: notes.trim() || undefined,
          },
          {
            onSuccess: (result) => {
              toast.success(t("recorded", { count: typeIds.length }));
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
      <div className="flex flex-col gap-1 text-[13px]">
        <div className="flex items-center justify-between">
          <span className="font-medium">{t("type")}</span>
          {typeIds.length > 0 && (
            <span className="text-fg-muted">{t("selectedTotal", { points: selectedTotal })}</span>
          )}
        </div>
        {activeTypes.length === 0 ? (
          <p className="text-fg-muted">{t("noTypes")}</p>
        ) : (
          <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-sm border border-border p-2">
            {activeTypes.map((type) => {
              const checked = typeIds.includes(type.id);
              const disabled = !checked && typeIds.length >= MAX_TYPES;
              return (
                <label
                  key={type.id}
                  className="flex min-h-9 items-center gap-2 rounded-xs px-1.5 py-1 hover:bg-bg"
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() => {
                      toggleType(type.id);
                    }}
                  />
                  <span className="flex-1 text-fg">{type.name}</span>
                  <span className="text-fg-muted [font-variant-numeric:tabular-nums]">
                    {type.points}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {typeIds.length >= MAX_TYPES && <p className="text-fg-muted">{t("maxTypesReached")}</p>}
      </div>
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
        <Button
          type="submit"
          loading={record.isPending}
          disabled={!studentId || typeIds.length === 0}
        >
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, EmptyState, IconButton, Input, domainIcons, useToast } from "@newsekolah/ui";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type SPLevel, useUpdateDisciplinePolicyMutation } from "../api";

/** Editable copy of one ladder row; kept as strings so an empty number field doesn't force 0. */
interface DraftLevel {
  level: number;
  label: string;
  minPoints: string;
}

function toDraft(levels: SPLevel[]): DraftLevel[] {
  return levels.map((level) => ({
    level: level.level,
    label: level.label,
    minPoints: String(level.min_points),
  }));
}

export function DisciplinePolicyEditor({
  initialLevels,
}: {
  initialLevels: SPLevel[];
}): ReactElement {
  const t = useTranslations("app.discipline.policy");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const update = useUpdateDisciplinePolicyMutation();
  const [levels, setLevels] = useState<DraftLevel[]>(() => toDraft(initialLevels));

  function updateLevel(index: number, patch: Partial<DraftLevel>) {
    setLevels((prev) => prev.map((level, i) => (i === index ? { ...level, ...patch } : level)));
  }

  function removeLevel(index: number) {
    setLevels((prev) =>
      prev.filter((_, i) => i !== index).map((level, i) => ({ ...level, level: i + 1 })),
    );
  }

  function addLevel() {
    setLevels((prev) => [...prev, { level: prev.length + 1, label: "", minPoints: "" }]);
  }

  async function save() {
    const payload: SPLevel[] = levels.map((level) => ({
      level: level.level,
      label: level.label.trim(),
      min_points: Number(level.minPoints) || 0,
    }));
    try {
      await update.mutateAsync(payload);
      toast.success(t("saved"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      {levels.length === 0 ? (
        <EmptyState
          icon={<domainIcons.violation aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[3rem_1fr_10rem_2.5rem] gap-2 text-[12px] font-medium text-fg-muted">
            <span>{t("columns.level")}</span>
            <span>{t("columns.label")}</span>
            <span>{t("columns.minPoints")}</span>
            <span className="sr-only">{t("remove")}</span>
          </div>
          {levels.map((level, index) => (
            <div key={index} className="grid grid-cols-[3rem_1fr_10rem_2.5rem] items-center gap-2">
              <span className="text-[14px] tabular-nums text-fg">{level.level}</span>
              <label className="sr-only" htmlFor={`sp-level-label-${index}`}>
                {t("columns.label")}
              </label>
              <Input
                id={`sp-level-label-${index}`}
                value={level.label}
                placeholder={t("levelPlaceholder")}
                onChange={(e) => {
                  updateLevel(index, { label: e.target.value });
                }}
              />
              <label className="sr-only" htmlFor={`sp-level-points-${index}`}>
                {t("columns.minPoints")}
              </label>
              <Input
                id={`sp-level-points-${index}`}
                type="number"
                min={0}
                value={level.minPoints}
                onChange={(e) => {
                  updateLevel(index, { minPoints: e.target.value });
                }}
              />
              <IconButton
                icon={<Trash2 />}
                aria-label={t("remove")}
                variant="ghost"
                onClick={() => {
                  removeLevel(index);
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="secondary" size="sm" icon={<Plus />} onClick={addLevel}>
          {t("addLevel")}
        </Button>
        <Button size="sm" loading={update.isPending} onClick={() => void save()}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}

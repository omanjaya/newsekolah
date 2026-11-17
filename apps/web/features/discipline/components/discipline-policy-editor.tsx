"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Card,
  NumberInput,
  Field,
  Button,
  EmptyState,
  IconButton,
  Input,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
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
      <p className="text-body-sm text-fg-muted">{t("description")}</p>

      {levels.length === 0 ? (
        <EmptyState
          icon={<domainIcons.violation aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {/* Desktop and tablet: aligned columns. The fixed 10rem points column leaves too
              little room for the label input on a phone, so mobile gets its own stacked card
              below instead of squeezing this grid. */}
          <div className="hidden sm:flex sm:flex-col sm:gap-2">
            <div className="grid grid-cols-[3rem_1fr_10rem_2.5rem] gap-2 text-caption font-medium text-fg-muted">
              <span>{t("columns.level")}</span>
              <span>{t("columns.label")}</span>
              <span>{t("columns.minPoints")}</span>
              <span className="sr-only">{t("remove")}</span>
            </div>
            {levels.map((level, index) => (
              <div
                key={index}
                className="grid grid-cols-[3rem_1fr_10rem_2.5rem] items-center gap-2"
              >
                <span className="text-body tabular-nums text-fg">{level.level}</span>
                <Input
                  id={`sp-level-label-${index}`}
                  aria-label={t("columns.label")}
                  value={level.label}
                  placeholder={t("levelPlaceholder")}
                  onChange={(e) => {
                    updateLevel(index, { label: e.target.value });
                  }}
                />
                <NumberInput
                  id={`sp-level-points-${index}`}
                  aria-label={t("columns.minPoints")}
                  min={0}
                  value={level.minPoints === "" ? null : Number(level.minPoints)}
                  onChange={(next) => {
                    updateLevel(index, { minPoints: next === null ? "" : String(next) });
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

          {/* Mobile: one card per level, fields stacked full width. */}
          <div className="flex flex-col gap-3 sm:hidden">
            {levels.map((level, index) => (
              <Card key={index} tone="sunken" padding="sm">
                <div className="flex items-center justify-between">
                  <span className="text-label tabular-nums text-fg">
                    {t("columns.level")} {level.level}
                  </span>
                  <IconButton
                    icon={<Trash2 />}
                    aria-label={t("remove")}
                    variant="ghost"
                    onClick={() => {
                      removeLevel(index);
                    }}
                  />
                </div>
                <Field label={t("columns.label")}>
                  <Input
                    value={level.label}
                    placeholder={t("levelPlaceholder")}
                    onChange={(e) => {
                      updateLevel(index, { label: e.target.value });
                    }}
                  />
                </Field>
                <Field label={t("columns.minPoints")}>
                  <NumberInput
                    min={0}
                    value={level.minPoints === "" ? null : Number(level.minPoints)}
                    onChange={(next) => {
                      updateLevel(index, { minPoints: next === null ? "" : String(next) });
                    }}
                  />
                </Field>
              </Card>
            ))}
          </div>
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

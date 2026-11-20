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
import { validateLevels } from "../lib/sp-policy-validation";

/** Editable copy of one ladder row; kept as strings so an empty number field doesn't force 0. */
interface DraftLevel {
  level: number;
  label: string;
  minPoints: string;
}

/**
 * Focuses the first control in the layout the reader sees: each field is
 * rendered twice (the desktop grid and the phone cards), one of them hidden
 * with display:none, which has no client rects.
 */
function focusFirstVisible(ids: string[]) {
  const controls = ids
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null);
  const target = controls.find((el) => el.getClientRects().length > 0) ?? controls[0];
  target?.focus();
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
  // Errors show once a save was attempted, then follow every edit.
  const [attempted, setAttempted] = useState(false);
  const errors = attempted ? validateLevels(levels) : new Map<number, never>();
  const errorText = (key: string | undefined) => (key ? t(`errors.${key}`) : undefined);

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
    setAttempted(true);
    const problems = validateLevels(levels);
    const first = [...problems.keys()].sort((a, b) => a - b)[0];
    if (first !== undefined) {
      const field = problems.get(first)?.label ? "label" : "points";
      focusFirstVisible([`sp-level-${field}-${first}`, `sp-level-${field}-m-${first}`]);
      return;
    }
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
              <div key={index} className="grid grid-cols-[3rem_1fr_10rem_2.5rem] items-start gap-2">
                <span className="flex h-11 items-center text-body tabular-nums text-fg md:pointer-fine:h-9">
                  {level.level}
                </span>
                <Field
                  label={t("columns.label")}
                  hideLabel
                  id={`sp-level-label-${index}`}
                  error={errorText(errors.get(index)?.label)}
                >
                  <Input
                    value={level.label}
                    placeholder={t("levelPlaceholder")}
                    onChange={(e) => {
                      updateLevel(index, { label: e.target.value });
                    }}
                  />
                </Field>
                <Field
                  label={t("columns.minPoints")}
                  hideLabel
                  id={`sp-level-points-${index}`}
                  error={errorText(errors.get(index)?.minPoints)}
                >
                  <NumberInput
                    min={0}
                    value={level.minPoints === "" ? null : Number(level.minPoints)}
                    onChange={(next) => {
                      updateLevel(index, { minPoints: next === null ? "" : String(next) });
                    }}
                  />
                </Field>
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
                <Field
                  label={t("columns.label")}
                  id={`sp-level-label-m-${index}`}
                  error={errorText(errors.get(index)?.label)}
                >
                  <Input
                    value={level.label}
                    placeholder={t("levelPlaceholder")}
                    onChange={(e) => {
                      updateLevel(index, { label: e.target.value });
                    }}
                  />
                </Field>
                <Field
                  label={t("columns.minPoints")}
                  id={`sp-level-points-m-${index}`}
                  error={errorText(errors.get(index)?.minPoints)}
                >
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

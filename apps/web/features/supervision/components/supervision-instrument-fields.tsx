"use client";

import {
  Button,
  Field,
  FieldError,
  FormSection,
  IconButton,
  Input,
  NumberInput,
} from "@newsekolah/ui";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { SupervisionCriterion, SupervisionInstrument } from "../api";
import {
  criterionKeyFrom,
  duplicateCriterionKeys,
  duplicateCriterionNames,
  keyFollowsName,
  normalizedCriterionName,
  uniqueCriterionKey,
} from "../lib/criterion-key";

/**
 * Editable criteria list and scale for one instrument, shared by the create
 * and edit cycle forms. A criterion's `key` is the short code the
 * observation form scores against: it follows the name while the
 * criterion is new (nobody has to invent one), and is fixed once it exists
 * (`lockedKeys`), since recorded scores point at it. Two criteria named
 * alike get numbered codes (`_2`), but the name itself is marked on both
 * rows, since the scoring form shows criteria by name and two identical
 * rows could not be told apart; a code typed twice is marked the same
 * way, since the API refuses an instrument whose codes repeat.
 */
export function SupervisionInstrumentFields({
  instrument,
  onChange,
  lockedKeys,
}: {
  instrument: SupervisionInstrument;
  onChange: (next: SupervisionInstrument) => void;
  lockedKeys?: ReadonlySet<string>;
}): ReactElement {
  const t = useTranslations("app.supervision.instrument");
  const duplicates = duplicateCriterionKeys(instrument.criteria);
  const duplicateNames = duplicateCriterionNames(instrument.criteria);

  function updateCriterion(index: number, patch: Partial<SupervisionCriterion>) {
    const criteria = instrument.criteria.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ ...instrument, criteria });
  }

  function renameCriterion(index: number, criterion: SupervisionCriterion, name: string) {
    const locked = lockedKeys?.has(criterion.key) ?? false;
    const followsName = keyFollowsName(criterion.key, criterion.name);
    const taken = new Set(instrument.criteria.filter((_, i) => i !== index).map((c) => c.key));
    updateCriterion(index, {
      name,
      ...(!locked && followsName ? { key: uniqueCriterionKey(criterionKeyFrom(name), taken) } : {}),
    });
  }

  function removeCriterion(index: number) {
    onChange({ ...instrument, criteria: instrument.criteria.filter((_, i) => i !== index) });
  }

  function addCriterion() {
    onChange({
      ...instrument,
      criteria: [...instrument.criteria, { key: "", name: "" }],
    });
  }

  return (
    <>
      <FormSection title={t("heading")} description={t("headingHint")}>
        <Field label={t("name")} required className="col-span-full">
          <Input
            value={instrument.name}
            onChange={(e) => {
              onChange({ ...instrument, name: e.target.value });
            }}
            placeholder={t("namePlaceholder")}
            autoComplete="off"
          />
        </Field>
        <Field label={t("scaleMin")} hint={t("scaleMinHint")}>
          <NumberInput
            value={instrument.scale_min}
            min={0}
            max={10}
            stepper
            onChange={(value) => {
              onChange({ ...instrument, scale_min: value ?? 0 });
            }}
          />
        </Field>
        <Field label={t("scaleMax")} hint={t("scaleMaxHint")}>
          <NumberInput
            value={instrument.scale_max}
            min={1}
            max={10}
            stepper
            onChange={(value) => {
              onChange({ ...instrument, scale_max: value ?? 0 });
            }}
          />
        </Field>
      </FormSection>

      <FormSection title={t("criteria")} description={t("criteriaHint")} columns={1}>
        <ol className="flex flex-col gap-3">
          {instrument.criteria.map((criterion, index) => {
            const locked = lockedKeys?.has(criterion.key) ?? false;
            const duplicate = duplicates.has(criterion.key.trim());
            const errorId = `criterion-key-error-${index}`;
            const nameDuplicate = duplicateNames.has(normalizedCriterionName(criterion.name));
            const nameErrorId = `criterion-name-error-${index}`;
            return (
              <li key={index} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-label text-fg-muted tabular-nums pointer-coarse:size-11"
                >
                  {index + 1}
                </span>
                <div className="grid grid-cols-1 min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                  <Input
                    value={criterion.name}
                    onChange={(e) => {
                      renameCriterion(index, criterion, e.target.value);
                    }}
                    aria-label={t("criterionNameLabel", { index: index + 1 })}
                    placeholder={t("criterionNamePlaceholder")}
                    autoComplete="off"
                    invalid={nameDuplicate}
                    aria-describedby={nameDuplicate ? nameErrorId : undefined}
                  />
                  <Input
                    value={criterion.key}
                    readOnly={locked}
                    onChange={(e) => {
                      updateCriterion(index, { key: e.target.value });
                    }}
                    aria-label={t("criterionKeyLabel", { index: index + 1 })}
                    placeholder={t("criterionKeyPlaceholder")}
                    autoComplete="off"
                    className="text-fg-muted"
                    invalid={duplicate}
                    aria-describedby={duplicate ? errorId : undefined}
                  />
                  {nameDuplicate && (
                    <div className="sm:col-span-2">
                      <FieldError id={nameErrorId}>{t("criterionNameDuplicate")}</FieldError>
                    </div>
                  )}
                  {duplicate && (
                    <div className="sm:col-span-2">
                      <FieldError id={errorId}>{t("criterionKeyDuplicate")}</FieldError>
                    </div>
                  )}
                </div>
                <IconButton
                  icon={<Trash2 />}
                  aria-label={t("removeCriterionNumbered", { index: index + 1 })}
                  disabled={instrument.criteria.length <= 1}
                  onClick={() => {
                    removeCriterion(index);
                  }}
                />
              </li>
            );
          })}
        </ol>
        <div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<Plus />}
            onClick={addCriterion}
          >
            {t("addCriterion")}
          </Button>
        </div>
      </FormSection>
    </>
  );
}

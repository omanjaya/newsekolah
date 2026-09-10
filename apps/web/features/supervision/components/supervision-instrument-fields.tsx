"use client";

import { Button, IconButton, Input } from "@newsekolah/ui";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { SupervisionCriterion, SupervisionInstrument } from "../api";

/**
 * Editable criteria list and scale for one instrument, shared by the create
 * and edit cycle forms. A criterion's `key` is a short slug the observation
 * form later scores against, so it stays editable only while new.
 */
export function SupervisionInstrumentFields({
  instrument,
  onChange,
}: {
  instrument: SupervisionInstrument;
  onChange: (next: SupervisionInstrument) => void;
}): ReactElement {
  const t = useTranslations("app.supervision.instrument");

  function updateCriterion(index: number, patch: Partial<SupervisionCriterion>) {
    const criteria = instrument.criteria.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ ...instrument, criteria });
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
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("name")}</span>
        <Input
          value={instrument.name}
          onChange={(e) => {
            onChange({ ...instrument, name: e.target.value });
          }}
          placeholder={t("namePlaceholder")}
          required
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("scaleMin")}</span>
          <Input
            type="number"
            value={instrument.scale_min}
            onChange={(e) => {
              onChange({ ...instrument, scale_min: Number.parseInt(e.target.value, 10) || 0 });
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("scaleMax")}</span>
          <Input
            type="number"
            value={instrument.scale_max}
            onChange={(e) => {
              onChange({ ...instrument, scale_max: Number.parseInt(e.target.value, 10) || 0 });
            }}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2 text-[13px]">
        <legend className="font-medium">{t("criteria")}</legend>
        <div className="flex flex-col gap-2">
          {instrument.criteria.map((criterion, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={criterion.key}
                onChange={(e) => {
                  updateCriterion(index, { key: e.target.value });
                }}
                placeholder={t("criterionKeyPlaceholder")}
                className="w-32"
              />
              <Input
                value={criterion.name}
                onChange={(e) => {
                  updateCriterion(index, { name: e.target.value });
                }}
                placeholder={t("criterionNamePlaceholder")}
                className="flex-1"
              />
              <IconButton
                icon={<Trash2 />}
                aria-label={t("removeCriterion")}
                onClick={() => {
                  removeCriterion(index);
                }}
              />
            </div>
          ))}
        </div>
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
      </fieldset>
    </div>
  );
}

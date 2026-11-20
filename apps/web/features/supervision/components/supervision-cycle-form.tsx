"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, DialogFooter, Field, FormError, Input, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type SupervisionCycle,
  type SupervisionInstrument,
  useCreateSupervisionCycleMutation,
  useUpdateSupervisionCycleMutation,
} from "../api";
import { duplicateCriterionKeys, duplicateCriterionNames } from "../lib/criterion-key";

import { SupervisionInstrumentFields } from "./supervision-instrument-fields";

const EMPTY_INSTRUMENT: SupervisionInstrument = {
  name: "",
  scale_min: 1,
  scale_max: 4,
  criteria: [{ key: "", name: "" }],
};

/**
 * Creates or edits a supervision cycle: its name, then the instrument the
 * observations are scored with. Save stays available and lists what is
 * missing instead of staying greyed out.
 */
export function SupervisionCycleForm({
  initial,
  onDone,
}: {
  initial?: SupervisionCycle;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.supervision.cycles.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateSupervisionCycleMutation();
  const update = useUpdateSupervisionCycleMutation();

  const [name, setName] = useState(initial?.name ?? "");
  const [instrument, setInstrument] = useState<SupervisionInstrument>(
    initial?.instrument ?? EMPTY_INSTRUMENT,
  );
  const [lockedKeys] = useState(
    () => new Set((initial?.instrument.criteria ?? []).map((criterion) => criterion.key)),
  );
  // An instrument saved before names had to be unique keeps its repeated
  // names editable, as the API allows; any new repetition blocks Save.
  const [legacyRepeatedNames] = useState(() =>
    duplicateCriterionNames(initial?.instrument.criteria ?? []),
  );
  const [attempted, setAttempted] = useState(false);

  const pending = create.isPending || update.isPending;
  const problems = [
    ...(name.trim() === "" ? [t("errors.name")] : []),
    ...(instrument.name.trim() === "" ? [t("errors.instrumentName")] : []),
    ...(instrument.scale_max <= instrument.scale_min ? [t("errors.scale")] : []),
    ...(instrument.criteria.length === 0 ||
    instrument.criteria.some((c) => c.key.trim() === "" || c.name.trim() === "")
      ? [t("errors.criteria")]
      : []),
    ...(duplicateCriterionKeys(instrument.criteria).size > 0
      ? [t("errors.criteriaDuplicate")]
      : []),
    ...([...duplicateCriterionNames(instrument.criteria)].some(
      (name) => !legacyRepeatedNames.has(name),
    )
      ? [t("errors.criteriaNameDuplicate")]
      : []),
  ];

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (problems.length > 0 || pending) return;
        const body = { name: name.trim(), instrument };
        const onSuccess = () => {
          toast.success(t("saved"));
          onDone();
        };
        const onError = (error: unknown) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        };
        if (initial) {
          update.mutate({ cycleId: initial.id, ...body }, { onSuccess, onError });
        } else {
          create.mutate(body, { onSuccess, onError });
        }
      }}
    >
      {attempted && problems.length > 0 && <FormError errors={problems} />}
      <Field label={t("name")} required>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder={t("namePlaceholder")}
          maxLength={100}
          autoComplete="off"
        />
      </Field>

      <SupervisionInstrumentFields
        instrument={instrument}
        onChange={setInstrument}
        lockedKeys={lockedKeys}
      />

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

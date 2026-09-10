"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, useToast } from "@newsekolah/ui";
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

import { SupervisionInstrumentFields } from "./supervision-instrument-fields";

const EMPTY_INSTRUMENT: SupervisionInstrument = {
  name: "",
  scale_min: 1,
  scale_max: 4,
  criteria: [{ key: "", name: "" }],
};

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

  const pending = create.isPending || update.isPending;
  const validCriteria =
    instrument.criteria.length > 0 &&
    instrument.criteria.every((c) => c.key.trim() !== "" && c.name.trim() !== "");
  const canSubmit = name.trim() !== "" && instrument.name.trim() !== "" && validCriteria;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
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
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("name")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder={t("namePlaceholder")}
          required
          maxLength={100}
        />
      </label>

      <div className="border-t border-border pt-4">
        <SupervisionInstrumentFields instrument={instrument} onChange={setInstrument} />
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending} disabled={!canSubmit}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

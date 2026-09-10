"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type Incident,
  type IncidentWrite,
  useCreateIncidentMutation,
  useUpdateIncidentMutation,
} from "../api";

type Severity = IncidentWrite["severity"];

const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

function nowLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

export function IncidentForm({
  incident,
  onDone,
}: {
  incident?: Incident;
  onDone: (incident?: Incident) => void;
}): ReactElement {
  const t = useTranslations("app.visitors.incidents.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateIncidentMutation();
  const update = useUpdateIncidentMutation();

  const [occurredAt, setOccurredAt] = useState(
    incident ? incident.occurred_at.slice(0, 16) : nowLocal(),
  );
  const [severity, setSeverity] = useState<Severity>(incident?.severity ?? "low");
  const [description, setDescription] = useState(incident?.description ?? "");
  const [personsInvolved, setPersonsInvolved] = useState(incident?.persons_involved ?? "");
  const [actionTaken, setActionTaken] = useState(incident?.action_taken ?? "");

  const severityOptions = SEVERITIES.map((value) => ({ value, label: t(`severities.${value}`) }));
  const canSubmit = description.trim() !== "" && occurredAt !== "";
  const isPending = create.isPending || update.isPending;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const body: IncidentWrite = {
          occurred_at: new Date(occurredAt).toISOString(),
          severity,
          description: description.trim(),
          persons_involved: personsInvolved.trim() || undefined,
          action_taken: actionTaken.trim() || undefined,
        };
        const onSettled = {
          onSuccess: (saved: Incident) => {
            toast.success(t(incident ? "updated" : "recorded"));
            onDone(saved);
          },
          onError: (error: unknown) => {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        };
        if (incident) {
          update.mutate({ id: incident.id, ...body }, onSettled);
        } else {
          create.mutate(body, onSettled);
        }
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("occurredAt")}</span>
        <Input
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => {
            setOccurredAt(e.target.value);
          }}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("severity")}</span>
        <Select
          options={severityOptions}
          value={severity}
          onValueChange={(v) => {
            setSeverity(v as Severity);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("description")}</span>
        <Textarea
          rows={4}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          maxLength={2000}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("personsInvolved")}</span>
        <Textarea
          rows={2}
          value={personsInvolved}
          onChange={(e) => {
            setPersonsInvolved(e.target.value);
          }}
          maxLength={1000}
          placeholder={t("personsInvolvedPlaceholder")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("actionTaken")}</span>
        <Textarea
          rows={3}
          value={actionTaken}
          onChange={(e) => {
            setActionTaken(e.target.value);
          }}
          maxLength={2000}
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
        <Button type="submit" loading={isPending} disabled={!canSubmit}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

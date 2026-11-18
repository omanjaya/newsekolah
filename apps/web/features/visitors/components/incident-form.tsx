"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  DatePicker,
  DialogFooter,
  Field,
  FormSection,
  Select,
  Textarea,
  TimePicker,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import {
  type Incident,
  type IncidentWrite,
  useCreateIncidentMutation,
  useUpdateIncidentMutation,
} from "../api";
import { SEVERITIES } from "../lib/incident-severity";
import { joinInstant, splitInstant } from "../lib/instant";

type Severity = IncidentWrite["severity"];

/**
 * Records or edits an incident: when it happened (school date and time,
 * defaulting to now), how serious it is, what happened, who was involved
 * and what was done. Save stays available and names any gap.
 */
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
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  const create = useCreateIncidentMutation();
  const update = useUpdateIncidentMutation();

  const [initial] = useState(() =>
    splitInstant(incident ? new Date(incident.occurred_at) : businessNow(), timeZone),
  );
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [severity, setSeverity] = useState<Severity>(incident?.severity ?? "low");
  const [description, setDescription] = useState(incident?.description ?? "");
  const [personsInvolved, setPersonsInvolved] = useState(incident?.persons_involved ?? "");
  const [actionTaken, setActionTaken] = useState(incident?.action_taken ?? "");
  const [attempted, setAttempted] = useState(false);

  const occurredAt = joinInstant(date, time, timeZone);
  const errors = {
    occurredAt: occurredAt === null ? t("errors.occurredAt") : undefined,
    description: description.trim() === "" ? t("errors.description") : undefined,
  };
  const shown = (error: string | undefined) => (attempted ? error : undefined);
  const isPending = create.isPending || update.isPending;

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (occurredAt === null || errors.description !== undefined || isPending) return;
        const body: IncidentWrite = {
          occurred_at: occurredAt.toISOString(),
          severity,
          description: description.trim(),
          persons_involved: personsInvolved.trim() || undefined,
          action_taken: actionTaken.trim() || undefined,
        };
        const callbacks = {
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
          update.mutate({ id: incident.id, ...body }, callbacks);
        } else {
          create.mutate(body, callbacks);
        }
      }}
    >
      <FormSection columns={1}>
        <Field label={t("occurredAt")} required error={shown(errors.occurredAt)}>
          {(control) => (
            <div
              role="group"
              aria-labelledby={control.labelId}
              aria-describedby={control["aria-describedby"]}
              className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2"
            >
              <DatePicker
                value={date}
                onChange={setDate}
                aria-label={t("date")}
                invalid={attempted && date === ""}
                required
              />
              <TimePicker
                value={time}
                onChange={setTime}
                aria-label={t("time")}
                invalid={attempted && time === ""}
                required
              />
            </div>
          )}
        </Field>
        <Field label={t("severity")} required>
          <Select
            options={SEVERITIES.map((value) => ({ value, label: t(`severities.${value}`) }))}
            value={severity}
            onValueChange={(v) => {
              setSeverity(v as Severity);
            }}
          />
        </Field>
        <Field label={t("description")} required error={shown(errors.description)}>
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
            }}
            maxLength={2000}
          />
        </Field>
        <Field label={t("personsInvolved")} optional>
          <Textarea
            rows={2}
            value={personsInvolved}
            onChange={(e) => {
              setPersonsInvolved(e.target.value);
            }}
            maxLength={1000}
          />
        </Field>
        <Field label={t("actionTaken")} optional>
          <Textarea
            rows={2}
            value={actionTaken}
            onChange={(e) => {
              setActionTaken(e.target.value);
            }}
            maxLength={2000}
          />
        </Field>
      </FormSection>
      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onDone();
          }}
        >
          {t("cancel")}
        </Button>
        <Button type="submit" loading={isPending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

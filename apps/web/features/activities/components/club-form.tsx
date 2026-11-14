"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Select,
  NumberInput,
  TimePicker,
  DialogFooter,
  Field,
  Button,
  Checkbox,
  Input,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type Extracurricular,
  type ExtracurricularWrite,
  useCreateExtracurricularMutation,
  useUpdateExtracurricularMutation,
} from "../api";
const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Radix Select has no empty value; this one stands for "no fixed day". */
const NO_DAY = "none";

export function ClubForm({
  initial,
  onDone,
}: {
  initial?: Extracurricular;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.activities.clubs.form");
  const tClubs = useTranslations("app.activities.clubs");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateExtracurricularMutation();
  const update = useUpdateExtracurricularMutation();

  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [meetingDay, setMeetingDay] = useState(
    initial?.meeting_day !== undefined ? String(initial.meeting_day) : "",
  );
  const [meetingStart, setMeetingStart] = useState(initial?.meeting_start ?? "");
  const [meetingEnd, setMeetingEnd] = useState(initial?.meeting_end ?? "");

  const pending = create.isPending || update.isPending;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body: ExtracurricularWrite = {
          name: name.trim(),
          description: description.trim() || undefined,
          capacity: capacity.trim() ? Number(capacity) : undefined,
          location: location.trim() || undefined,
          meeting_day: meetingDay === "" ? undefined : Number(meetingDay),
          meeting_start: meetingStart.trim() || undefined,
          meeting_end: meetingEnd.trim() || undefined,
          is_active: isActive,
          coach_user_id: initial?.coach_user_id,
        };
        const onSuccess = () => {
          toast.success(tClubs("saved"));
          onDone();
        };
        const onError = (error: unknown) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        };
        if (initial) {
          update.mutate({ id: initial.id, ...body }, { onSuccess, onError });
        } else {
          create.mutate(body, { onSuccess, onError });
        }
      }}
    >
      <Field label={t("name")}>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
          maxLength={150}
        />
      </Field>
      <Field label={t("description")}>
        <Textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          maxLength={2000}
          rows={3}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("capacity")}>
          <NumberInput
            value={capacity === "" ? null : Number(capacity)}
            min={1}
            onChange={(next) => {
              setCapacity(next === null ? "" : String(next));
            }}
          />
        </Field>
        <Field label={t("location")}>
          <Input
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
            }}
            maxLength={150}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={t("meetingDay")}>
          <Select
            value={meetingDay === "" ? NO_DAY : meetingDay}
            onValueChange={(next) => {
              setMeetingDay(next === NO_DAY ? "" : next);
            }}
            options={[
              { value: NO_DAY, label: t("meetingDayNone") },
              ...WEEKDAY_KEYS.map((key, index) => ({
                value: String(index),
                label: tClubs(`weekdays.${key}`),
              })),
            ]}
          />
        </Field>
        <Field label={t("meetingStart")}>
          <TimePicker value={meetingStart} onChange={setMeetingStart} />
        </Field>
        <Field label={t("meetingEnd")}>
          <TimePicker value={meetingEnd} onChange={setMeetingEnd} />
        </Field>
      </div>
      {initial && (
        <Checkbox
          label={t("active")}
          checked={isActive}
          onCheckedChange={(checked) => {
            setIsActive(checked === true);
          }}
        />
      )}
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

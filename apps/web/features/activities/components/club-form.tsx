"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Checkbox, Input, Textarea, useToast } from "@newsekolah/ui";
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
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("name")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
          maxLength={150}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("description")}</span>
        <Textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          maxLength={2000}
          rows={3}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("capacity")}</span>
          <Input
            type="number"
            value={capacity}
            onChange={(e) => {
              setCapacity(e.target.value);
            }}
            min={1}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("location")}</span>
          <Input
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
            }}
            maxLength={150}
          />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("meetingDay")}</span>
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
            value={meetingDay}
            onChange={(e) => {
              setMeetingDay(e.target.value);
            }}
          >
            <option value="">{t("meetingDayNone")}</option>
            {WEEKDAY_KEYS.map((key, index) => (
              <option key={key} value={index}>
                {tClubs(`weekdays.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("meetingStart")}</span>
          <Input
            type="time"
            value={meetingStart}
            onChange={(e) => {
              setMeetingStart(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("meetingEnd")}</span>
          <Input
            type="time"
            value={meetingEnd}
            onChange={(e) => {
              setMeetingEnd(e.target.value);
            }}
          />
        </label>
      </div>
      {initial && (
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox
            checked={isActive}
            onCheckedChange={(checked) => {
              setIsActive(checked === true);
            }}
          />
          {t("active")}
        </label>
      )}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

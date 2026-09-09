"use client";

import { Button, Checkbox, Input } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import type { Period } from "../api";

export function PeriodForm({
  initial,
  nextSequence,
  lastEnd,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: Period;
  nextSequence: number;
  lastEnd: string;
  pending: boolean;
  onSubmit: (body: {
    name: string;
    sequence: number;
    starts_at: string;
    ends_at: string;
    is_break: boolean;
  }) => Promise<void>;
  onCancel: () => void;
}): ReactElement {
  const t = useTranslations("app.school.periods");
  const [name, setName] = useState(initial?.name ?? `${t("lessonPrefix")} ${nextSequence}`);
  const [sequence, setSequence] = useState(String(initial?.sequence ?? nextSequence));
  const [start, setStart] = useState(initial?.starts_at.slice(0, 5) ?? lastEnd);
  const [end, setEnd] = useState(initial?.ends_at.slice(0, 5) ?? addMinutes(lastEnd, 45));
  const [isBreak, setIsBreak] = useState(initial?.is_break ?? false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({
          name: name.trim(),
          sequence: Number(sequence),
          starts_at: start,
          ends_at: end,
          is_break: isBreak,
        });
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("name")}</span>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("sequence")}</span>
          <Input
            type="number"
            min={1}
            value={sequence}
            onChange={(e) => {
              setSequence(e.target.value);
            }}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("start")}</span>
          <Input
            type="time"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
            }}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("end")}</span>
          <Input
            type="time"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
            }}
            required
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <Checkbox
          checked={isBreak}
          onCheckedChange={(v) => {
            setIsBreak(v === true);
          }}
        />
        {t("break")}
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

"use client";

import { Button, Checkbox, Dialog, DialogContent, Input, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import type { GradeLevel } from "../../school/api";
import type { CalendarEvent, CalendarEventInput, CalendarEventKind } from "../api";

const KINDS: CalendarEventKind[] = ["holiday", "exam", "event", "no_school", "semester_break"];

export function EventFormDialog({
  open,
  initial,
  defaultDate,
  gradeLevels,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  initial?: CalendarEvent;
  defaultDate: string;
  gradeLevels: GradeLevel[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: CalendarEventInput) => void;
}): ReactElement {
  const t = useTranslations("app.calendar");
  const [name, setName] = useState(initial?.name ?? "");
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [endDate, setEndDate] = useState(initial?.end_date ?? initial?.date ?? defaultDate);
  const [kind, setKind] = useState<CalendarEventKind>(initial?.kind ?? "event");
  const [gradeLevelIds, setGradeLevelIds] = useState<string[]>(initial?.grade_level_ids ?? []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setName("");
          setDate(defaultDate);
          setEndDate(defaultDate);
          setKind("event");
          setGradeLevelIds([]);
        }
      }}
    >
      <DialogContent title={initial ? t("editEvent") : t("addEvent")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              name: name.trim(),
              date,
              end_date: endDate,
              kind,
              grade_level_ids: gradeLevelIds.length > 0 ? gradeLevelIds : undefined,
            });
          }}
        >
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("form.name")}</span>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              maxLength={150}
              required
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("form.startDate")}</span>
              <Input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (e.target.value > endDate) setEndDate(e.target.value);
                }}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("form.endDate")}</span>
              <Input
                type="date"
                value={endDate}
                min={date}
                onChange={(e) => {
                  setEndDate(e.target.value);
                }}
                required
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("form.kind")}</span>
            <Select
              options={KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))}
              value={kind}
              onValueChange={(v) => {
                setKind(v as CalendarEventKind);
              }}
            />
          </label>
          {gradeLevels.length > 0 && (
            <fieldset className="flex flex-col gap-2 text-[13px]">
              <legend className="font-medium">{t("form.gradeLevels")}</legend>
              <p className="text-fg-muted">{t("form.gradeLevelsHint")}</p>
              <div className="flex flex-wrap gap-3">
                {gradeLevels.map((g) => (
                  <label key={g.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={gradeLevelIds.includes(g.id)}
                      onCheckedChange={(checked) => {
                        setGradeLevelIds((prev) =>
                          checked === true ? [...prev, g.id] : prev.filter((id) => id !== g.id),
                        );
                      }}
                    />
                    {g.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("form.cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {t("form.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

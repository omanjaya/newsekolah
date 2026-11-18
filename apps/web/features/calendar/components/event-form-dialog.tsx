"use client";

import {
  Button,
  Checkbox,
  cn,
  DateRangePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  Select,
} from "@newsekolah/ui";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import type { GradeLevel } from "../../school/api";
import type { CalendarEvent, CalendarEventInput, CalendarEventKind } from "../api";
import { EVENT_KIND_TONE, EVENT_KINDS, TONE_DOT } from "../lib/event-kinds";

export function EventFormDialog({
  open,
  initial,
  defaultDate,
  today,
  gradeLevels,
  pending,
  onOpenChange,
  onDelete,
  onSubmit,
}: {
  open: boolean;
  initial?: CalendarEvent;
  defaultDate: string;
  /** The school's today, marked in the date picker. */
  today?: string;
  gradeLevels: GradeLevel[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present only when editing an event the viewer may delete. */
  onDelete?: () => void;
  onSubmit: (body: CalendarEventInput) => void;
}): ReactElement {
  const t = useTranslations("app.calendar");
  const [name, setName] = useState(initial?.name ?? "");
  const [range, setRange] = useState({
    from: initial?.date ?? defaultDate,
    to: initial?.end_date ?? initial?.date ?? defaultDate,
  });
  const [kind, setKind] = useState<CalendarEventKind>(initial?.kind ?? "event");
  const [gradeLevelIds, setGradeLevelIds] = useState<string[]>(initial?.grade_level_ids ?? []);
  const [submitted, setSubmitted] = useState(false);
  const nameMissing = submitted && name.trim() === "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setName("");
          setRange({ from: defaultDate, to: defaultDate });
          setKind("event");
          setGradeLevelIds([]);
          setSubmitted(false);
        }
      }}
    >
      <DialogContent title={initial ? t("editEvent") : t("addEvent")} size="md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            if (name.trim() === "" || !range.from) return;
            onSubmit({
              name: name.trim(),
              date: range.from,
              end_date: range.to || range.from,
              kind,
              grade_level_ids: gradeLevelIds.length > 0 ? gradeLevelIds : undefined,
            });
          }}
        >
          <Field
            label={t("form.name")}
            required
            error={nameMissing ? t("form.nameRequired") : undefined}
          >
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              maxLength={150}
            />
          </Field>
          <Field label={t("form.dates")} required hint={t("form.datesHint")}>
            <DateRangePicker
              value={range}
              onChange={setRange}
              today={today}
              fromName="date"
              toName="end_date"
            />
          </Field>
          <Field label={t("form.kind")}>
            <Select
              options={EVENT_KINDS.map((k) => ({
                value: k,
                label: t(`kind.${k}`),
                // The kind's colour on the calendar, so the pick matches the legend.
                icon: (
                  <span className={cn("size-2.5 rounded-full", TONE_DOT[EVENT_KIND_TONE[k]])} />
                ),
              }))}
              value={kind}
              onValueChange={(v) => {
                setKind(v as CalendarEventKind);
              }}
            />
          </Field>
          {gradeLevels.length > 0 && (
            <Field label={t("form.gradeLevels")} hint={t("form.gradeLevelsHint")} optional>
              {(control) => (
                <div
                  role="group"
                  aria-labelledby={control.labelId}
                  aria-describedby={control["aria-describedby"]}
                  className="flex flex-wrap gap-x-5 gap-y-2"
                >
                  {gradeLevels.map((g) => (
                    <Checkbox
                      key={g.id}
                      label={g.name}
                      checked={gradeLevelIds.includes(g.id)}
                      onCheckedChange={(checked) => {
                        setGradeLevelIds((prev) =>
                          checked === true ? [...prev, g.id] : prev.filter((id) => id !== g.id),
                        );
                      }}
                    />
                  ))}
                </div>
              )}
            </Field>
          )}
          <DialogFooter>
            {initial && onDelete && (
              <Button
                type="button"
                variant="ghost"
                icon={<Trash2 />}
                className="mr-auto text-danger"
                onClick={onDelete}
              >
                {t("deleteEvent")}
              </Button>
            )}
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

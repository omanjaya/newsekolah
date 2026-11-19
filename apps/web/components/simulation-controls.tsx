"use client";

import { Button, DatePicker, Field, Select, TimePicker, cn } from "@newsekolah/ui";
import { ChevronDown, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { useSession } from "../lib/session/session-provider";
import {
  businessNow,
  clearSimulation,
  instantFromSchoolTime,
  schoolDateTime,
  setSimulation,
  useBusinessNow,
  useSimulation,
  type SimulationMode,
} from "../lib/simulation/clock";

/**
 * The simulated clock for test schools, as one strip in the header's
 * sticky stack: quiet and neutral while the real time applies, the
 * warning tint once a simulated time is set. The strip's own line opens
 * the settings below it, so the controls take room only while the tester
 * is using them. Renders nothing for an account that may not simulate.
 */
export function SimulationControls(): ReactElement | null {
  const { me } = useSession();
  const { active, identity, revision } = useSimulation();
  const now = useBusinessNow();
  const t = useTranslations("app.shell.simulation");
  const tStrip = useTranslations("app.shell.strip");
  const timeZone = me?.tenant.timezone ?? "UTC";
  const [modeChoice, setModeChoice] = useState<{ revision: number; mode: SimulationMode } | null>(
    null,
  );
  const mode =
    modeChoice !== null && modeChoice.revision === revision
      ? modeChoice.mode
      : (active?.mode ?? "frozen");

  if (!identity?.allowed) return null;

  function shift(milliseconds: number) {
    setSimulation(active?.mode ?? mode, new Date(businessNow().getTime() + milliseconds));
  }

  const display = new Intl.DateTimeFormat(me?.tenant.locale === "en" ? "en-US" : "id-ID", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  const defaults = schoolDateTime(now, timeZone);

  return (
    <div
      role="status"
      data-testid="simulation-controls"
      className={cn(
        "flex items-start gap-3 px-4 text-body-sm md:px-6",
        active ? "bg-warning-soft text-warning-soft-fg" : "bg-surface-sunken text-fg",
      )}
    >
      <details className="group min-w-0 flex-1">
        <summary
          title={active ? `${t("warning")} ${t(active.mode)}` : t("intro")}
          className="flex min-h-10 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden"
        >
          <Clock aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold">
              {active ? tStrip("simulation", { time: display }) : t("title")}
            </span>
            <span className="hidden sm:inline"> · {active ? t(active.mode) : t("settings")}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 motion-indicator group-open:rotate-180"
          />
        </summary>
        <div key={`${revision}:${timeZone}`} className="flex flex-col gap-3 pt-1 pb-3">
          <p className="text-body-sm">{active ? t("warning") : t("intro")}</p>
          <div className="flex flex-wrap items-end gap-2 rounded-md bg-surface p-3 text-fg ring-1 ring-border">
            <SimulationMoment
              defaults={defaults}
              timeZone={timeZone}
              mode={mode}
              modeField={
                <Field label={t("mode")} className="min-w-32 flex-1">
                  <Select
                    value={mode}
                    onValueChange={(value) => {
                      setModeChoice({ revision, mode: value as SimulationMode });
                    }}
                    options={[
                      { value: "frozen", label: t("frozen") },
                      { value: "running", label: t("running") },
                    ]}
                  />
                </Field>
              }
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                shift(15 * 60_000);
              }}
            >
              {t("plus15")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                shift(60 * 60_000);
              }}
            >
              {t("plusHour")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                shift(24 * 60 * 60_000);
              }}
            >
              {t("plusDay")}
            </Button>
          </div>
        </div>
      </details>
      {active && (
        <Button
          size="sm"
          variant="secondary"
          className="mt-1"
          onClick={() => {
            clearSimulation();
          }}
        >
          {t("reset")}
        </Button>
      )}
    </div>
  );
}

/**
 * The school date and time to jump to, then the mode field and Apply. It
 * holds the moment the panel showed when it opened: the panel remounts
 * it for each new simulation and each time zone, so an untouched field
 * does not tick along with the clock.
 */
function SimulationMoment({
  defaults,
  timeZone,
  mode,
  modeField,
}: {
  defaults: { date: string; time: string };
  timeZone: string;
  mode: SimulationMode;
  modeField: ReactNode;
}): ReactElement {
  const t = useTranslations("app.shell.simulation");
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [invalid, setInvalid] = useState(false);

  function apply() {
    const instant = instantFromSchoolTime(date, time, timeZone);
    if (!instant) {
      setInvalid(true);
      return;
    }
    setSimulation(mode, instant);
  }

  return (
    <>
      <Field label={t("date")} className="min-w-36 flex-1">
        <DatePicker
          value={date}
          today={defaults.date}
          invalid={invalid}
          onChange={(next) => {
            setDate(next);
            setInvalid(false);
          }}
        />
      </Field>
      <Field label={t("time", { zone: timeZone })} className="min-w-28 flex-1">
        <TimePicker
          value={time}
          invalid={invalid}
          onChange={(next) => {
            setTime(next);
            setInvalid(false);
          }}
        />
      </Field>
      {modeField}
      <Button size="sm" onClick={apply}>
        {t("apply")}
      </Button>
    </>
  );
}

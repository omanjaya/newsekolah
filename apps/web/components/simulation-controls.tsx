"use client";

import { Button, Input, Select, cn } from "@newsekolah/ui";
import { ChevronDown, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import type { ReactElement } from "react";

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
  const dateInput = useRef<HTMLInputElement>(null);
  const timeInput = useRef<HTMLInputElement>(null);
  const dateId = useId();
  const timeId = useId();
  const modeId = useId();
  const [modeChoice, setModeChoice] = useState<{ revision: number; mode: SimulationMode } | null>(
    null,
  );
  const mode = modeChoice?.revision === revision ? modeChoice.mode : (active?.mode ?? "frozen");
  const [invalid, setInvalid] = useState(false);

  if (!identity?.allowed) return null;

  function apply() {
    const instant = instantFromSchoolTime(
      dateInput.current?.value ?? "",
      timeInput.current?.value ?? "",
      timeZone,
    );
    if (!instant) {
      setInvalid(true);
      return;
    }
    setSimulation(mode, instant);
  }

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
          className="flex min-h-10 cursor-pointer list-none items-center gap-3 outline-none [&::-webkit-details-marker]:hidden"
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
            <div className="flex min-w-36 flex-1 flex-col gap-1.5">
              <label htmlFor={dateId} className="text-label text-fg">
                {t("date")}
              </label>
              <Input
                id={dateId}
                ref={dateInput}
                type="date"
                defaultValue={defaults.date}
                invalid={invalid}
                onChange={() => {
                  setInvalid(false);
                }}
              />
            </div>
            <div className="flex min-w-28 flex-1 flex-col gap-1.5">
              <label htmlFor={timeId} className="text-label text-fg">
                {t("time", { zone: timeZone })}
              </label>
              <Input
                id={timeId}
                ref={timeInput}
                type="time"
                defaultValue={defaults.time}
                invalid={invalid}
                onChange={() => {
                  setInvalid(false);
                }}
              />
            </div>
            <div className="flex min-w-32 flex-1 flex-col gap-1.5">
              <label id={modeId} className="text-label text-fg">
                {t("mode")}
              </label>
              <Select
                aria-labelledby={modeId}
                value={mode}
                onValueChange={(value) => {
                  setModeChoice({ revision, mode: value as SimulationMode });
                }}
                options={[
                  { value: "frozen", label: t("frozen") },
                  { value: "running", label: t("running") },
                ]}
              />
            </div>
            <Button size="sm" onClick={apply}>
              {t("apply")}
            </Button>
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

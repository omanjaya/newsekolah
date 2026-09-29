"use client";

import { Alert, Button, Input, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
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

export function SimulationControls(): ReactElement | null {
  const { me } = useSession();
  const { active, identity, revision } = useSimulation();
  const now = useBusinessNow();
  const t = useTranslations("app.shell.simulation");
  const timeZone = me?.tenant.timezone ?? "UTC";
  const dateInput = useRef<HTMLInputElement>(null);
  const timeInput = useRef<HTMLInputElement>(null);
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
      className="border-b border-border bg-bg px-4 py-2 md:px-6"
      data-testid="simulation-controls"
    >
      {active ? (
        <Alert variant="warning" title={t("active", { time: display, zone: timeZone })}>
          <p>{t("warning")}</p>
          <p>{t(active.mode)}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              clearSimulation();
            }}
          >
            {t("reset")}
          </Button>
        </Alert>
      ) : null}
      <details className="mt-1 text-[13px] text-fg">
        <summary className="cursor-pointer font-medium">
          {active ? t("settings") : t("title")}
        </summary>
        <p className="mt-2 text-fg-muted">{t("intro")}</p>
        <div
          key={`${revision}:${timeZone}`}
          className="mt-2 flex flex-wrap items-end gap-2 rounded-sm border border-border bg-surface p-3"
        >
          <label className="min-w-36 flex-1 text-[13px] text-fg-muted">
            {t("date")}
            <Input
              ref={dateInput}
              type="date"
              defaultValue={defaults.date}
              invalid={invalid}
              onChange={() => {
                setInvalid(false);
              }}
            />
          </label>
          <label className="min-w-28 flex-1 text-[13px] text-fg-muted">
            {t("time", { zone: timeZone })}
            <Input
              ref={timeInput}
              type="time"
              defaultValue={defaults.time}
              invalid={invalid}
              onChange={() => {
                setInvalid(false);
              }}
            />
          </label>
          <div className="min-w-32 flex-1 text-[13px] text-fg-muted">
            <label id="simulation-mode-label">{t("mode")}</label>
            <Select
              aria-labelledby="simulation-mode-label"
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
      </details>
    </div>
  );
}

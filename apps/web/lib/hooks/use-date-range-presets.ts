"use client";

import type { DataTableDateRangePreset } from "@newsekolah/ui";
import { useTranslations } from "next-intl";

import { useSession } from "../session/session-provider";
import { useSimulation } from "../simulation/clock";
import {
  endOfPreviousIsoMonth,
  shiftIsoDate,
  startOfIsoMonth,
  startOfPreviousIsoMonth,
  todayInZone,
} from "../tenant-date";

/**
 * The shared "Hari ini / 7 hari terakhir / Bulan ini / Bulan lalu" quick
 * picks for a `DataTableFilters` "dateRange" filter. Computed here --
 * `packages/ui` never computes "today" itself -- from `businessNow()` in
 * the tenant's timezone, so a superadmin's time simulation (docs/testing-time-simulation.md)
 * still lines up with what the filter bar offers.
 */
export function useDateRangePresets(): DataTableDateRangePreset[] {
  useSimulation();
  const t = useTranslations("app.common.dateRange.presets");
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  const today = todayInZone(timeZone);

  return [
    { label: t("today"), from: today, to: today },
    { label: t("last7Days"), from: shiftIsoDate(today, -6), to: today },
    { label: t("thisMonth"), from: startOfIsoMonth(today), to: today },
    {
      label: t("lastMonth"),
      from: startOfPreviousIsoMonth(today),
      to: endOfPreviousIsoMonth(today),
    },
  ];
}

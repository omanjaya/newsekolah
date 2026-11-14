"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";

import { SchoolAttendanceToday } from "./school-attendance-today";

/**
 * The first screen of staff who do not take class attendance (a principal,
 * a counsellor): the school's attendance at a glance and the way to the
 * reports and the live monitor, rather than an empty personal calendar.
 */
export function StaffAttendanceHub(): ReactElement {
  const t = useTranslations("app.attendance");
  return (
    <AppPage navParams={["date"]}>
      <SchoolAttendanceToday hint={t("staffHubBody")} />
    </AppPage>
  );
}

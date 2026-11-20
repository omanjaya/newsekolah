"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { useMyAchievementsQuery, useMyActivityEventsQuery, useMyClubsQuery } from "../api";

import { ActivitiesRecord } from "./activities-record";

/**
 * A student's own activities: the clubs they belong to, the school
 * activities they take part in that have not ended, and their achievements
 * this year. Every list is the student's own, read from /v1/me/*.
 */
export function MyActivitiesView(): ReactElement {
  const t = useTranslations("app.activities.mine");
  const clubs = useMyClubsQuery();
  const events = useMyActivityEventsQuery();
  const achievements = useMyAchievementsQuery();
  return (
    <AppPage title={t("title")} description={t("description")}>
      <ActivitiesRecord clubs={clubs} events={events} achievements={achievements} />
    </AppPage>
  );
}

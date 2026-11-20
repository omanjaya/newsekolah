"use client";

import type { ReactElement } from "react";

import { useAchievementsQuery, useStudentClubMembershipsQuery } from "../api";

import { ActivitiesRecord } from "./activities-record";

/**
 * The student profile's activities tab: the student's clubs and this
 * year's achievements, read with view_activities like the activities pages.
 */
export function StudentActivitiesTab({ studentId }: { studentId: string }): ReactElement {
  const clubs = useStudentClubMembershipsQuery(studentId);
  const achievements = useAchievementsQuery(studentId);
  return <ActivitiesRecord clubs={clubs} achievements={achievements} />;
}

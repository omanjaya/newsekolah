"use client";

import type { ReactElement } from "react";

import { useStudentAchievementsQuery, useStudentClubMembershipsQuery } from "../api";

import { ActivitiesRecord } from "./activities-record";

/**
 * The student profile's activities tab: the student's clubs and their
 * achievements in every academic year (a profile is a cumulative record),
 * read with view_activities like the activities pages.
 */
export function StudentActivitiesTab({ studentId }: { studentId: string }): ReactElement {
  const clubs = useStudentClubMembershipsQuery(studentId);
  const achievements = useStudentAchievementsQuery(studentId);
  return <ActivitiesRecord clubs={clubs} achievements={achievements} achievementsAllYears />;
}

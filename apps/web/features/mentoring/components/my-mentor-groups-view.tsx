"use client";

import type { ReactElement } from "react";

import { MentorGroupsView } from "./mentor-groups-view";

/** Both legacy URLs now share the same scope filter and group detail. */
export function MyMentorGroupsView(): ReactElement {
  return <MentorGroupsView initialScope="mine" />;
}

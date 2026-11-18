"use client";

import type { ReactElement } from "react";

import { DashboardView } from "./dashboard-view";

/**
 * The home destination for every role. One template serves them all (the
 * librarian included): the persona blocks decide the hero, the tiles and
 * the cards, and the side column carries the reader's shortcuts, so no
 * row of buttons sits above the greeting any more.
 */
export function HomeWorkspaceView(): ReactElement {
  return <DashboardView />;
}

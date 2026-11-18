"use client";

import { useSyncExternalStore } from "react";

import { localTodayIso } from "../utils/iso-date.js";

function subscribe(): () => void {
  return () => undefined;
}

/**
 * The device's local date as "YYYY-MM-DD", or "" while rendering on the
 * server and hydrating. A server in UTC and a browser in WIB disagree on
 * the date for seven hours a day, so the server renders no "today" at all
 * rather than a marker that hydration would have to correct.
 *
 * Only a fallback: screens pass the school-timezone date in explicitly.
 */
export function useLocalToday(): string {
  return useSyncExternalStore(subscribe, localTodayIso, () => "");
}

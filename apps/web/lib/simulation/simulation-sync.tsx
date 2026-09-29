"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useSession } from "../session/session-provider";

import {
  businessNow,
  notifySimulationDayChange,
  schoolDateTime,
  syncSimulationIdentity,
  useSimulation,
} from "./clock";

export function SimulationSync(): null {
  const { me, isReady } = useSession();
  const queryClient = useQueryClient();
  const { active, revision } = useSimulation();
  const previousRevision = useRef(revision);

  useEffect(() => {
    if (isReady) syncSimulationIdentity(me);
  }, [isReady, me]);

  useEffect(() => {
    if (revision !== previousRevision.current) {
      previousRevision.current = revision;
      const filter = {
        predicate: (query: { queryKey: readonly unknown[] }) =>
          query.queryKey[0] !== "me" && query.queryKey[0] !== "auth",
      };
      void queryClient.cancelQueries(filter).then(() => queryClient.invalidateQueries(filter));
    }
  }, [queryClient, revision]);

  useEffect(() => {
    if (active?.mode !== "running" || !me?.tenant.timezone) return;
    const zone = me.tenant.timezone;
    let currentDay = schoolDateTime(businessNow(), zone).date;
    const timer = window.setInterval(() => {
      const nextDay = schoolDateTime(businessNow(), zone).date;
      if (nextDay !== currentDay) {
        currentDay = nextDay;
        notifySimulationDayChange();
      }
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [active?.mode, active?.instant, me?.tenant.timezone]);

  return null;
}

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
  const { active, clockRevision } = useSimulation();
  const previousRevision = useRef(clockRevision);

  useEffect(() => {
    if (isReady) syncSimulationIdentity(me);
  }, [isReady, me]);

  // Refetch what the page shows only when the business clock moved. Every
  // page load resolves the reader's identity; with no simulation in play
  // that changes nothing, and invalidating then cancelled and refetched
  // every query, the server-seeded branding included (the public branding
  // endpoint allows 60 requests a minute per IP).
  useEffect(() => {
    if (clockRevision !== previousRevision.current) {
      previousRevision.current = clockRevision;
      const filter = {
        predicate: (query: { queryKey: readonly unknown[] }) =>
          query.queryKey[0] !== "me" && query.queryKey[0] !== "auth",
      };
      void queryClient.cancelQueries(filter).then(() => queryClient.invalidateQueries(filter));
    }
  }, [queryClient, clockRevision]);

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

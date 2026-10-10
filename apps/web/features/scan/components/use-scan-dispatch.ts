"use client";

import { ApiError } from "@newsekolah/api-client";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useScanLibraryKioskVisitMutation } from "../../library/visits-api";
import {
  useCurrentLateArrivalQuery,
  useOpenLateArrivalMutation,
  useScanClassroomEntryMutation,
  useScanExitPermitStageMutation,
  useScanGateMutation,
  useScanLateArrivalStageMutation,
} from "../../permits/api";
import { classifyScanFailure, resolveScanRoute } from "../lib/dispatch";
import type { ScanRoute } from "../lib/dispatch";

export interface ScanOutcome {
  key: string;
  ok: boolean;
  message: string;
}

/**
 * Runs the existing action for a scanned code (see `resolveScanRoute`):
 * every branch calls the same mutation the dedicated screen uses, so the
 * server-side permission, profile and token checks stay the single source
 * of truth. Resolves with a ready-to-show outcome and never rejects.
 */
export function useScanDispatch(): (raw: string) => Promise<ScanOutcome> {
  const t = useTranslations("app.scan");
  const apiErrorMessage = useApiErrorMessage();
  const counter = useRef(0);

  const classroomEntry = useScanClassroomEntryMutation();
  const exitStage = useScanExitPermitStageMutation();
  const gate = useScanGateMutation();
  const openLate = useOpenLateArrivalMutation();
  const lateStage = useScanLateArrivalStageMutation();
  const libraryVisit = useScanLibraryKioskVisitMutation();
  // Disabled: only refetched on demand to learn whether a late arrival is
  // already open, which decides between "open" and "confirm stage".
  const currentLate = useCurrentLateArrivalQuery(false);

  const run = useCallback(
    async (route: Exclude<ScanRoute, { action: "unknown" }>): Promise<string> => {
      const { token, instanceId = "" } = route;
      switch (route.action) {
        case "classroom_entry": {
          const data = await classroomEntry.mutateAsync({ token });
          return t("results.classroom_entry", { teacher: data.teacher_name });
        }
        case "exit_stage": {
          const data = await exitStage.mutateAsync({ id: instanceId, token });
          return t("results.exit_stage", { student: formatDisplayName(data.student_name) });
        }
        case "gate_exit": {
          const data = await gate.mutateAsync({ id: instanceId, token });
          return t("results.gate_exit", {
            student: formatDisplayName(data.student_name),
            className: data.class_name,
          });
        }
        case "late_arrival": {
          const { data: current } = await currentLate.refetch();
          if (!current) {
            await openLate.mutateAsync({ token });
            return t("results.late_arrival_open");
          }
          if (
            current.instance.status === "in_progress" &&
            current.instance.current_stage?.verification === "qr_scan"
          ) {
            await lateStage.mutateAsync({ id: current.instance.id, token });
            return t("results.late_arrival_stage");
          }
          throw new LateArrivalBusyError();
        }
        case "library_visit": {
          await libraryVisit.mutateAsync({ token });
          return t("results.library_visit");
        }
      }
    },
    [t, classroomEntry, exitStage, gate, openLate, lateStage, libraryVisit, currentLate],
  );

  return useCallback(
    async (raw: string): Promise<ScanOutcome> => {
      const key = String(++counter.current);
      const route = resolveScanRoute(raw);
      if (route.action === "unknown") {
        return { key, ok: false, message: t(`unknown.${route.reason}`) };
      }
      try {
        return { key, ok: true, message: await run(route) };
      } catch (error) {
        if (error instanceof LateArrivalBusyError) {
          return { key, ok: false, message: t("failures.lateArrivalBusy") };
        }
        if (error instanceof ApiError) {
          return {
            key,
            ok: false,
            message:
              classifyScanFailure(error.status) === "expired"
                ? t("failures.expired")
                : apiErrorMessage(error.code),
          };
        }
        return { key, ok: false, message: apiErrorMessage("UNKNOWN") };
      }
    },
    [t, run, apiErrorMessage],
  );
}

class LateArrivalBusyError extends Error {}

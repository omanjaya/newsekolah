"use client";

import { ApiError } from "@newsekolah/api-client";
import type { components } from "@newsekolah/api-client";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useScanLibraryKioskVisitMutation } from "../../library/visits-api";
import {
  useCurrentLateArrivalQuery,
  useMyExitPermitsQuery,
  useOpenLateArrivalMutation,
  useScanClassroomEntryMutation,
  useScanExitPermitStageMutation,
  useScanGateMutation,
  useScanLateArrivalStageMutation,
} from "../../permits/api";
import type { MyExitPermit } from "../../permits/api";
import {
  deskApprovalTarget,
  deskRefusal,
  stageJustApproved,
} from "../../permits/lib/desk-approval";
import type { DeskApprovalTarget, DeskRefusal } from "../../permits/lib/desk-approval";
import { permitLessonsOver } from "../../permits/lib/lesson-period-options";
import { usePeriodsQuery } from "../../reference/api";
import { classifyScanFailure, expiredScanMessageKey, resolveScanRoute } from "../lib/dispatch";
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
  const { me } = useSession();
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
  // Disabled too: read on demand for the duty desk's approval QR, which
  // names no permit, to find the student's own permit waiting on the desk.
  const myExitPermits = useMyExitPermitsQuery(false);
  // Read on demand too, only when a desk scan approves nothing: whether
  // the permit's lessons are over decides what the student is told.
  const periods = usePeriodsQuery(false);

  // A permit whose last lesson has ended can take no further stage and no
  // gate QR (as the exit permit screen reads it), so pointing the student
  // to either would send them to a step that cannot work.
  const deskRefusalFor = useCallback(
    async (target: DeskRefusalTarget): Promise<DeskRefusal> => {
      if (target.kind === "none") return deskRefusal(target, false);
      const { data } = await periods.refetch();
      const over = permitLessonsOver(target.permit, data?.data, businessNow(), me?.tenant.timezone);
      return deskRefusal(target, over);
    },
    [periods, me?.tenant.timezone],
  );

  // Only the permit's own student can scan a stage QR (the API refuses
  // anyone else), so the result speaks to them, as the exit permit
  // screen's scan dialog does, and never names them back to themselves.
  const exitStageResult = useCallback(
    (instance: WorkflowInstance, approved?: WorkflowStage): string => {
      if (instance.status !== "in_progress") return t("results.exit_approved");
      const label = (approved ?? stageJustApproved(instance))?.label;
      return label ? t("results.exit_stage", { stage: label }) : t("results.exit_stage_plain");
    },
    [t],
  );

  const run = useCallback(
    async (route: Exclude<ScanRoute, { action: "unknown" }>): Promise<string> => {
      const { token, instanceId = "" } = route;
      switch (route.action) {
        case "classroom_entry": {
          const data = await classroomEntry.mutateAsync({ token });
          return t("results.classroom_entry", { teacher: data.teacher_name });
        }
        case "approve_stage": {
          if (!instanceId) {
            // The duty desk's QR: it approves the scanning student's own
            // exit permit, never a late arrival (the API accepts it only
            // for an exit permit's any-teacher stage).
            const { data: mine } = await myExitPermits.refetch({ throwOnError: true });
            const target = deskApprovalTarget(mine?.data ?? []);
            if (target.kind !== "ready") throw new DeskScanRefusal(await deskRefusalFor(target));
            const data = await exitStage.mutateAsync({ id: target.permit.id, token });
            return exitStageResult(data.instance, target.permit.current_stage);
          }
          // The approver panel encodes the same "approve" payload for an
          // exit permit and a late arrival. Only the scanning student's own
          // late arrival can be the target of a late-arrival stage, so a
          // match on its id routes there; anything else is an exit permit.
          const { data: current } = await currentLate.refetch();
          if (current?.instance.id === instanceId && current.instance.status === "in_progress") {
            await lateStage.mutateAsync({ id: instanceId, token });
            return t("results.late_arrival_stage");
          }
          const data = await exitStage.mutateAsync({ id: instanceId, token });
          return exitStageResult(data.instance);
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
          const visit = await libraryVisit.mutateAsync({ token });
          // A second scan within 30 minutes counts as the same visit.
          return t(
            visit.already_recorded ? "results.library_visit_already" : "results.library_visit",
          );
        }
      }
    },
    [
      t,
      exitStageResult,
      deskRefusalFor,
      classroomEntry,
      exitStage,
      gate,
      openLate,
      lateStage,
      libraryVisit,
      currentLate,
      myExitPermits,
    ],
  );

  const deskRefusalMessage = useCallback(
    (refusal: DeskRefusal): string => {
      switch (refusal.reason) {
        case "scanStage":
          return t("failures.permitAtOtherStage", { stage: refusal.stage });
        case "awaitingReview":
          return t("failures.permitAwaitingReview", { stage: refusal.stage });
        case "awaitingGate":
          return t("failures.permitAwaitingGate");
        case "lessonsOver":
          return t("failures.permitLessonsOver");
        case "none":
          return t("failures.noPermitAwaitingDesk");
      }
    },
    [t],
  );

  return useCallback(
    async (raw: string): Promise<ScanOutcome> => {
      const key = String(++counter.current);
      const route = resolveScanRoute(raw, me?.disabled_modules);
      if (route.action === "unknown") {
        return { key, ok: false, message: t(`unknown.${route.reason}`) };
      }
      try {
        return { key, ok: true, message: await run(route) };
      } catch (error) {
        if (error instanceof LateArrivalBusyError) {
          return { key, ok: false, message: t("failures.lateArrivalBusy") };
        }
        if (error instanceof DeskScanRefusal) {
          return { key, ok: false, message: deskRefusalMessage(error.refusal) };
        }
        if (error instanceof ApiError) {
          return {
            key,
            ok: false,
            message:
              classifyScanFailure(error.status) === "expired"
                ? t(expiredScanMessageKey(route.action))
                : apiErrorMessage(error.code),
          };
        }
        return { key, ok: false, message: apiErrorMessage("UNKNOWN") };
      }
    },
    [t, run, apiErrorMessage, deskRefusalMessage, me?.disabled_modules],
  );
}

class LateArrivalBusyError extends Error {}

type WorkflowInstance = components["schemas"]["WorkflowInstance"];
type WorkflowStage = components["schemas"]["WorkflowStage"];
type DeskRefusalTarget = Exclude<DeskApprovalTarget<MyExitPermit>, { kind: "ready" }>;

/** A desk approval QR scanned while no own exit permit waits on the desk. */
class DeskScanRefusal extends Error {
  constructor(readonly refusal: DeskRefusal) {
    super(`desk scan refused: ${refusal.reason}`);
  }
}

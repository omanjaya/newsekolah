"use client";

import { formatShortDateTime, type Locale } from "@newsekolah/i18n";
import {
  SemanticStatusBadge,
  Stepper,
  type StepperProps,
  type StepperStep,
  type StepperStepState,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import type { WorkflowInstance } from "../api";
import { buildMineStageTrack, type LeaveMineStageKey } from "../lib/leave-mine-stage-track";

/** The instance's current stage index, kept within its stages. */
function currentStageIndex(instance: WorkflowInstance): number {
  return Math.min(Math.max(instance.current_stage_index, 0), instance.stages.length - 1);
}

/** Where a stage of `instance` stands, from the instance's status and current index. */
function stageState(instance: WorkflowInstance, index: number): StepperStepState {
  const currentIndex = currentStageIndex(instance);
  if (instance.status === "approved" || instance.status === "completed") return "complete";
  if (index < currentIndex) return "complete";
  if (index === currentIndex) return instance.status === "in_progress" ? "current" : "stopped";
  return "upcoming";
}

interface StageActivity {
  /** When the stage was last acted on. */
  at: string;
  /** The newest note a person wrote on the stage (a reviewer's reason). */
  note?: string;
}

/** The statuses a person ends a request with at the stage it waits at. */
const ENDED_AT_STAGE: ReadonlySet<string> = new Set(["rejected", "cancelled"]);

/**
 * When each stage was last acted on and what its reviewer wrote, from the
 * event log (newest wins). A reject or cancel stored without a stage key
 * (a cancel recorded before the API kept one) belongs to the stage the
 * request stopped at, so that stage is dated by its end rather than by an
 * earlier event there such as the API's "opened" entry.
 */
function stageActivity(instance: WorkflowInstance): Map<string, StageActivity> {
  const activity = new Map<string, StageActivity>();
  const stoppedKey = instance.stages[currentStageIndex(instance)]?.key;
  const events = [...(instance.events ?? [])].sort((a, b) =>
    a.occurred_at.localeCompare(b.occurred_at),
  );
  for (const event of events) {
    const stageKey =
      event.stage_key ?? (ENDED_AT_STAGE.has(event.to_status) ? stoppedKey : undefined);
    if (!stageKey) continue;
    // A system note is the API's own log label ("opened", "letter issued"),
    // not something a person wrote, so the stepper leaves it out.
    const note = event.system_note ? "" : (event.note?.trim() ?? "");
    const written = note === "" ? undefined : note;
    const previous = activity.get(stageKey);
    activity.set(stageKey, { at: event.occurred_at, note: written ?? previous?.note });
  }
  return activity;
}

/**
 * The stages of one request as the shared `Stepper` (docs/07-ui-ux.md
 * section 3, Workflow): a stage still ahead says how it is verified, a
 * finished one what came of it ("Disetujui", or the last stage's own
 * outcome such as "Surat diterbitkan" when `finalOutcome` names it; the
 * request's end, such as "Ditolak", where it stopped) and when. A row
 * from 640px up and a list on a phone, where the row has no room for the
 * times.
 */
export function WorkflowSteps({
  instance,
  orientation,
  finalOutcome,
  className,
}: {
  instance: WorkflowInstance;
  orientation?: StepperProps["orientation"];
  /** What the last stage produced once complete (a leave request's issued letter); "Disetujui" otherwise. */
  finalOutcome?: string;
  className?: string;
}): ReactElement {
  const t = useTranslations("app.permits.workflow");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  const activity = stageActivity(instance);
  const lastIndex = instance.stages.length - 1;
  const steps: StepperStep[] = instance.stages.map((stage, index) => {
    const state = stageState(instance, index);
    // A request a person ended closed when they did: its closed_at dates
    // the stage it stopped at, whatever events that stage holds.
    const endedAt =
      state === "stopped" && ENDED_AT_STAGE.has(instance.status) ? instance.closed_at : undefined;
    const at = endedAt ?? activity.get(stage.key)?.at;
    const note = activity.get(stage.key)?.note;
    const acted = state === "complete" || state === "stopped";
    // A request that expired lapsed at its stage with no event of its own
    // (the expiry job writes none, and the web reads a permit whose lessons
    // are over as expired before it runs): the newest event there, such as
    // the API's "opened" entry, dates something else, so the stage shows
    // no time rather than the request's.
    const timed = state === "complete" || (state === "stopped" && instance.status !== "expired");
    const description =
      state === "complete"
        ? index === lastIndex && finalOutcome
          ? finalOutcome
          : t("outcome.approved")
        : state === "stopped"
          ? t(`status.${instance.status}`)
          : t(`verification.${stage.verification}`);
    return {
      id: stage.key,
      label: stage.label,
      description,
      note: acted && note ? t("stageNote", { note }) : undefined,
      time:
        at && timed
          ? // The shared short form ("19 Nov 16.32"), with the year only
            // outside the school's current one; midday UTC is that year everywhere.
            formatShortDateTime(at, {
              locale,
              timeZone,
              now: new Date(`${todayInZone(timeZone)}T12:00:00Z`),
            })
          : undefined,
      state,
    };
  });
  return (
    <Stepper
      steps={steps}
      currentIndex={instance.current_stage_index}
      orientation={orientation}
      className={className}
    />
  );
}

/** Stage progress plus a status line; the detail dialogs and review forms use it. */
export function WorkflowStepper({
  instance,
  finalOutcome,
  status = instance.status,
}: {
  instance: WorkflowInstance;
  /** Passed to `WorkflowSteps`: what the last stage produced once complete. */
  finalOutcome?: string;
  /**
   * What the request reads as, when that is not the stages' own status: an
   * exit permit approved but never used reads as expired while every stage
   * it passed stays approved.
   */
  status?: WorkflowInstance["status"];
}): ReactElement {
  const t = useTranslations("app.permits.workflow");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SemanticStatusBadge status={status} label={t(`status.${status}`)} />
        {instance.current_stage && status === "in_progress" && (
          <span className="text-body-sm text-fg-muted">
            {t("waitingFor", { stage: instance.current_stage.label })}
          </span>
        )}
      </div>
      <WorkflowSteps instance={instance} finalOutcome={finalOutcome} />
    </div>
  );
}

export function WorkflowStatusBadge({
  status,
}: {
  status: WorkflowInstance["status"];
}): ReactElement {
  const t = useTranslations("app.permits.workflow");
  return <SemanticStatusBadge status={status} label={t(`status.${status}`)} />;
}

const STAGE_LABEL_KEY: Record<LeaveMineStageKey, "stageHomeroom" | "stageCounselor"> = {
  homeroom: "stageHomeroom",
  counselor: "stageCounselor",
};

/**
 * The compact stage track for a leave request row: "Diajukan", each
 * default leave stage, then "Selesai", built from `buildMineStageTrack`
 * since the "mine" list only carries `status` and `current_stage_index`,
 * not the tenant's stage labels. The shared compact `Stepper`, so the
 * row speaks the same visual language as the full detail.
 */
export function WorkflowMineStageTrack({
  status,
  currentStageIndex,
  className,
}: {
  status: WorkflowInstance["status"];
  currentStageIndex: number;
  className?: string;
}): ReactElement {
  const t = useTranslations("app.permits.leave.mine");
  const nodes = buildMineStageTrack(status, currentStageIndex);
  const steps: StepperStep[] = nodes.map((node) => ({
    id: node.id,
    label:
      node.kind === "submitted"
        ? t("stageSubmitted")
        : node.kind === "done"
          ? t("stageDone")
          : t(STAGE_LABEL_KEY[node.stageKey ?? "homeroom"]),
    state: node.state,
  }));
  const current = nodes.findIndex((node) => node.state === "current");
  return (
    <div aria-label={t("stageTrackLabel")} role="group" className={className}>
      <Stepper variant="compact" steps={steps} currentIndex={current === -1 ? 0 : current} />
    </div>
  );
}

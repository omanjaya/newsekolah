import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkflowInstance } from "../api";

import { WorkflowMineStageTrack, WorkflowSteps } from "./workflow-stepper";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));

vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/tenant-date", () => ({ todayInZone: () => "2026-11-19" }));

/** The track's steps in order, as `[label, state]` read from the shared Stepper's markup. */
function steps(): [string, string][] {
  return screen.getAllByRole("listitem").map((node) => {
    // The marker's step number comes first in the text.
    const label = node.textContent.replace(/^\d+/, "");
    if (node.getAttribute("aria-current") === "step") return [label, "current"];
    // The Stepper says finished and stopped steps out loud after a comma.
    if (label.includes(", ")) return [label.split(", ")[0] ?? label, "said"];
    return [label, "upcoming"];
  });
}

describe("WorkflowMineStageTrack", () => {
  it("renders the four steps: submitted, homeroom, counselor, done", () => {
    render(<WorkflowMineStageTrack status="in_progress" currentStageIndex={0} />);
    expect(steps().map(([label]) => label.replace(/, .*/, ""))).toEqual([
      "stageSubmitted",
      "stageHomeroom",
      "stageCounselor",
      "stageDone",
    ]);
  });

  it("marks the current stage for an in-progress request at stage 0", () => {
    render(<WorkflowMineStageTrack status="in_progress" currentStageIndex={0} />);
    const states = steps();
    expect(states[1]).toEqual(["stageHomeroom", "current"]);
    expect(states[2]).toEqual(["stageCounselor", "upcoming"]);
  });

  it("marks every stage complete once approved, but done stays upcoming", () => {
    render(<WorkflowMineStageTrack status="approved" currentStageIndex={1} />);
    const states = steps();
    expect(states[1]?.[1]).toBe("said");
    expect(states[2]?.[1]).toBe("said");
    expect(states[3]).toEqual(["stageDone", "upcoming"]);
  });

  it("names the track for screen readers", () => {
    render(<WorkflowMineStageTrack status="completed" currentStageIndex={1} />);
    expect(screen.getByRole("group", { name: "stageTrackLabel" })).toBeInTheDocument();
  });
});

describe("WorkflowSteps", () => {
  const instance: WorkflowInstance = {
    id: "i1",
    kind: "exit_permit",
    status: "in_progress",
    current_stage_index: 1,
    subject_user_id: "s1",
    opened_at: "2026-11-14T02:10:00Z",
    stages: [
      { key: "duty", label: "Guru piket", approver_rule: "duty:picket", verification: "qr_scan" },
      { key: "bk", label: "Guru BK", approver_rule: "duty:counselor", verification: "qr_scan" },
    ],
    events: [
      {
        id: "e1",
        stage_key: "duty",
        to_status: "in_progress",
        verification: "qr_scan",
        system_note: false,
        occurred_at: "2026-11-14T02:14:00Z",
      },
    ],
  };

  it("says when a finished stage was done, in the school's time zone", () => {
    render(<WorkflowSteps instance={instance} />);
    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("09.14");
    expect(second).toHaveAttribute("aria-current", "step");
    expect(second).not.toHaveTextContent("09.14");
  });

  it("prints the time in the app's shared short form, with the year only outside this one", () => {
    const lastYear: WorkflowInstance = {
      ...instance,
      events: [
        {
          id: "e1",
          stage_key: "duty",
          to_status: "in_progress",
          verification: "qr_scan",
          system_note: false,
          occurred_at: "2025-09-25T02:14:00Z",
        },
      ],
    };
    const { unmount } = render(<WorkflowSteps instance={instance} />);
    // "14 Nov 09.14": no comma, and no year within the school's current one.
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("14 Nov 09.14");
    expect(screen.getAllByRole("listitem")[0]).not.toHaveTextContent("2026");
    unmount();

    render(<WorkflowSteps instance={lastYear} />);
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("25 Sep 2025 09.14");
  });

  // A finished stage read "Ditinjau langsung", how it is verified, instead
  // of what happened; only a stage still ahead says how it is verified.
  it("says what came of a finished stage and how a stage ahead is verified", () => {
    render(<WorkflowSteps instance={instance} />);
    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("outcome.approved");
    expect(first).not.toHaveTextContent("verification.qr_scan");
    expect(second).toHaveTextContent("verification.qr_scan");
  });

  it("gives the last stage its own outcome once the request is done", () => {
    render(
      <WorkflowSteps
        instance={{ ...instance, status: "completed" }}
        finalOutcome="Surat diterbitkan"
      />,
    );
    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("outcome.approved");
    expect(second).toHaveTextContent("Surat diterbitkan");
  });

  it("shows the reviewer's reason on the stage that rejected the request", () => {
    render(
      <WorkflowSteps
        instance={{
          ...instance,
          status: "rejected",
          events: [
            ...(instance.events ?? []),
            {
              id: "e2",
              stage_key: "bk",
              to_status: "rejected",
              verification: "manual",
              note: "Ada ulangan Matematika hari itu.",
              system_note: false,
              occurred_at: "2026-11-14T03:00:00Z",
            },
          ],
        }}
      />,
    );
    const [first, second] = screen.getAllByRole("listitem");
    expect(second).toHaveTextContent("stageNote");
    expect(first).not.toHaveTextContent("stageNote");
  });

  it("leaves out the notes the API flags as its own log labels", () => {
    render(
      <WorkflowSteps
        instance={{
          ...instance,
          events: [
            {
              id: "e1",
              stage_key: "duty",
              to_status: "in_progress",
              verification: "auto",
              note: "reviewed by the night shift",
              system_note: true,
              occurred_at: "2026-11-14T02:14:00Z",
            },
          ],
        }}
      />,
    );
    expect(screen.queryByText(/stageNote/)).not.toBeInTheDocument();
  });

  it("says how the request ended at the stage where it stopped", () => {
    render(<WorkflowSteps instance={{ ...instance, status: "rejected" }} />);
    const [, second] = screen.getAllByRole("listitem");
    expect(second).toHaveTextContent("status.rejected");
  });
});

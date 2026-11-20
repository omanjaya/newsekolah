import { describe, expect, it } from "vitest";

import { ownExitRefusalKey } from "./own-exit-refusal";

describe("ownExitRefusalKey", () => {
  it("words the student's own refusals to the student", () => {
    expect(ownExitRefusalKey("STUDENT_ON_LEAVE_TODAY")).toBe("onLeaveToday");
    expect(ownExitRefusalKey("EXIT_PERMIT_ALREADY_TODAY")).toBe("alreadyToday");
  });

  it("leaves every other code to the shared catalog", () => {
    expect(ownExitRefusalKey("WORKFLOW_ALREADY_IN_PROGRESS")).toBeNull();
    expect(ownExitRefusalKey("UNKNOWN")).toBeNull();
  });
});

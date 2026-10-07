import { describe, expect, it } from "vitest";

import { classifyScanFailure, resolveScanRoute } from "./dispatch";

describe("resolveScanRoute", () => {
  it.each([
    ["sion:classroom_entry::tok", "classroom_entry"],
    ["sion:late_arrival::tok", "late_arrival"],
    ["sion:library_visit::tok", "library_visit"],
  ])("maps %s to %s", (raw, action) => {
    expect(resolveScanRoute(raw)).toEqual({ action, token: "tok" });
  });

  it("maps the approve QR to the exit permit stage with its instance id", () => {
    expect(resolveScanRoute("sion:approve:inst-1:tok")).toEqual({
      action: "exit_stage",
      token: "tok",
      instanceId: "inst-1",
    });
  });

  it("maps the gate QR to the gate exit with its instance id", () => {
    expect(resolveScanRoute("sion:gate:inst-2:tok")).toEqual({
      action: "gate_exit",
      token: "tok",
      instanceId: "inst-2",
    });
  });

  it("accepts the scan-token purpose names as aliases", () => {
    expect(resolveScanRoute("sion:approve_stage:inst-1:tok").action).toBe("exit_stage");
    expect(resolveScanRoute("sion:gate_exit:inst-2:tok").action).toBe("gate_exit");
  });

  it("trims surrounding whitespace", () => {
    expect(resolveScanRoute("  sion:classroom_entry::tok\n").action).toBe("classroom_entry");
  });

  it("rejects an empty code", () => {
    expect(resolveScanRoute("   ")).toEqual({ action: "unknown", reason: "empty" });
  });

  it("does not guess the purpose of a bare token", () => {
    expect(resolveScanRoute("abc123")).toEqual({ action: "unknown", reason: "bare" });
  });

  it("rejects an unsupported kind", () => {
    expect(resolveScanRoute("sion:kiosk:x:tok")).toEqual({
      action: "unknown",
      reason: "unsupported",
    });
  });

  it("rejects a permit QR without an instance id", () => {
    expect(resolveScanRoute("sion:gate::tok")).toEqual({
      action: "unknown",
      reason: "missing_instance",
    });
  });
});

describe("classifyScanFailure", () => {
  it("treats 410 as an expired token", () => {
    expect(classifyScanFailure(410)).toBe("expired");
  });

  it("treats anything else as a generic error", () => {
    expect(classifyScanFailure(409)).toBe("error");
    expect(classifyScanFailure(undefined)).toBe("error");
  });
});

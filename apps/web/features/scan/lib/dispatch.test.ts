import { describe, expect, it } from "vitest";

import { SCAN_ACTION_MODULE, classifyScanFailure, resolveScanRoute, scanOffer } from "./dispatch";

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

describe("resolveScanRoute with switched-off modules", () => {
  it("answers every permits QR as unavailable while permits is off", () => {
    for (const raw of [
      "sion:classroom_entry::tok",
      "sion:late_arrival::tok",
      "sion:approve:inst-1:tok",
      "sion:gate:inst-2:tok",
    ]) {
      expect(resolveScanRoute(raw, ["permits"])).toEqual({
        action: "unknown",
        reason: "unavailable",
      });
    }
    expect(resolveScanRoute("sion:library_visit::tok", ["permits"])).toEqual({
      action: "library_visit",
      token: "tok",
    });
  });

  it("answers a library visit QR as unavailable while library is off", () => {
    expect(resolveScanRoute("sion:library_visit::tok", ["library"])).toEqual({
      action: "unknown",
      reason: "unavailable",
    });
    expect(resolveScanRoute("sion:classroom_entry::tok", ["library"]).action).toBe(
      "classroom_entry",
    );
  });

  it("maps every action to the module its endpoint belongs to", () => {
    expect(SCAN_ACTION_MODULE).toEqual({
      classroom_entry: "permits",
      late_arrival: "permits",
      exit_stage: "permits",
      gate_exit: "permits",
      library_visit: "library",
    });
  });
});

describe("scanOffer", () => {
  it("describes the actions still offered", () => {
    expect(scanOffer([])).toBe("all");
    expect(scanOffer(["permits"])).toBe("library");
    expect(scanOffer(["library", "billing"])).toBe("permits");
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

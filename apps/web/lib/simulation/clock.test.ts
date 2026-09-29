import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "../session/session-provider";

import {
  businessNow,
  clearSimulation,
  getSimulationTime,
  instantFromSchoolTime,
  schoolDateTime,
  setSimulation,
  simulationSnapshot,
  suspendSimulation,
  syncSimulationIdentity,
} from "./clock";

function user(id: string, tenantId: string, superadmin = false, actorId?: string): Me {
  return {
    id,
    name: id,
    username: id,
    roles: [],
    permissions: superadmin ? ["platform_superadmin"] : [],
    tenant: { tenant_id: tenantId, timezone: "Asia/Makassar", name: "School", locale: "id" },
    must_change_password: false,
    ...(actorId ? { impersonated_by: { user_id: actorId, name: actorId } } : {}),
  } as unknown as Me;
}

beforeEach(() => {
  sessionStorage.clear();
  clearSimulation();
  syncSimulationIdentity(undefined);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("business clock", () => {
  it("freezes or runs from a school's local date and time, then resets", () => {
    syncSimulationIdentity(user("admin", "school", true));
    const chosen = instantFromSchoolTime("2026-09-30", "08:15", "Asia/Makassar");
    expect(chosen?.toISOString()).toBe("2026-09-30T00:15:00.000Z");
    if (!chosen) throw new Error("Valid school time was rejected");

    setSimulation("frozen", chosen);
    vi.advanceTimersByTime(60 * 60_000);
    expect(businessNow().toISOString()).toBe("2026-09-30T00:15:00.000Z");

    setSimulation("running", chosen);
    vi.advanceTimersByTime(15 * 60_000);
    expect(getSimulationTime()).toBe("2026-09-30T00:30:00.000Z");
    expect(schoolDateTime(businessNow(), "Asia/Makassar")).toEqual({
      date: "2026-09-30",
      time: "08:30",
    });

    clearSimulation();
    expect(getSimulationTime()).toBeNull();
    expect(businessNow().toISOString()).toBe(new Date().toISOString());
  });

  it("restores only for the same superadmin actor and tenant during impersonation", () => {
    syncSimulationIdentity(user("admin", "school", true));
    setSimulation("frozen", new Date("2026-10-01T01:00:00Z"));
    suspendSimulation();
    expect(getSimulationTime()).toBeNull();
    syncSimulationIdentity(user("teacher", "school", false, "admin"));
    expect(getSimulationTime()).toBe("2026-10-01T01:00:00.000Z");

    syncSimulationIdentity(user("teacher", "other-school", false, "admin"));
    expect(getSimulationTime()).toBeNull();
    expect(simulationSnapshot().active).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("rejects another impersonating admin and invalid school calendar times", () => {
    syncSimulationIdentity(user("admin", "school", true));
    setSimulation("frozen", new Date("2026-10-01T01:00:00Z"));
    suspendSimulation();
    syncSimulationIdentity(user("target", "school", false, "other-admin"));
    expect(getSimulationTime()).toBeNull();
    expect(instantFromSchoolTime("2026-02-30", "10:00", "Asia/Makassar")).toBeNull();
    expect(instantFromSchoolTime("2026-09-30", "25:00", "Asia/Makassar")).toBeNull();
  });
});

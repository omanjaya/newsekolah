import { useSyncExternalStore } from "react";

import type { Me } from "../session/session-provider";

const STORAGE_KEY = "newsekolah:simulation-time:v1";

export type SimulationMode = "frozen" | "running";
export interface SimulationState {
  actorId: string;
  tenantId: string;
  mode: SimulationMode;
  instant: string;
  startedAt: number;
}

let active: SimulationState | null = null;
let identity: { actorId: string; tenantId: string; allowed: boolean } | null = null;
let revision = 0;
const listeners = new Set<() => void>();

function emit() {
  revision += 1;
  listeners.forEach((listener) => {
    listener();
  });
}

function readStored(): SimulationState | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const value = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<SimulationState> | null;
    if (
      !value ||
      typeof value.actorId !== "string" ||
      typeof value.tenantId !== "string" ||
      (value.mode !== "frozen" && value.mode !== "running") ||
      typeof value.instant !== "string" ||
      !Number.isFinite(Date.parse(value.instant)) ||
      !Number.isFinite(value.startedAt)
    )
      return null;
    return value as SimulationState;
  } catch {
    return null;
  }
}

function persist(value: SimulationState | null) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // The simulation remains usable for this page even when storage is unavailable.
  }
}

/** An impersonated account may use only its initiating superadmin's saved clock. */
export function resolveSimulation(me: Me | undefined, stored: SimulationState | null) {
  if (!me) return null;
  const actorId = me.impersonated_by?.user_id ?? me.id;
  const tenantId = me.tenant.tenant_id;
  const allowed = me.impersonated_by
    ? stored?.actorId === actorId && stored.tenantId === tenantId
    : me.permissions.includes("platform_superadmin");
  return { actorId, tenantId, allowed };
}

/** Called only after /v1/me has identified the real actor and tenant. */
export function syncSimulationIdentity(me: Me | undefined): boolean {
  const stored = readStored();
  const nextIdentity = resolveSimulation(me, stored);
  const nextActive =
    nextIdentity?.allowed &&
    stored?.actorId === nextIdentity.actorId &&
    stored.tenantId === nextIdentity.tenantId
      ? stored
      : null;
  if (me && stored && !nextActive) persist(null);
  const changed =
    JSON.stringify(active) !== JSON.stringify(nextActive) ||
    JSON.stringify(identity) !== JSON.stringify(nextIdentity);
  active = nextActive;
  identity = nextIdentity;
  if (changed) emit();
  return changed;
}

export function setSimulation(mode: SimulationMode, instant: Date): void {
  if (!identity?.allowed || !Number.isFinite(instant.getTime())) return;
  active = {
    actorId: identity.actorId,
    tenantId: identity.tenantId,
    mode,
    instant: instant.toISOString(),
    startedAt: Date.now(),
  };
  persist(active);
  emit();
}

export function clearSimulation(): void {
  const changed = active !== null;
  active = null;
  persist(null);
  if (changed) emit();
}

/** Pause requests while an impersonation token replaces the actor; keep the saved clock. */
export function suspendSimulation(): void {
  active = null;
  identity = null;
  emit();
}

export function notifySimulationDayChange(): void {
  if (active?.mode === "running") emit();
}

export function simulationSnapshot() {
  return { active, identity, revision };
}

export function businessNow(): Date {
  if (
    !active ||
    !identity?.allowed ||
    active.actorId !== identity.actorId ||
    active.tenantId !== identity.tenantId
  )
    return new Date();
  const start = Date.parse(active.instant);
  return new Date(start + (active.mode === "running" ? Date.now() - active.startedAt : 0));
}

export function getSimulationTime(): string | null {
  return active && identity?.allowed ? businessNow().toISOString() : null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSimulation() {
  useSyncExternalStore(
    subscribe,
    () => revision,
    () => 0,
  );
  return { active, identity, revision };
}

/** Refreshes displayed time every 30 seconds, and immediately for mode changes. */
export function useBusinessNow(): Date {
  useSimulation();
  useSyncExternalStore(
    (listener) => {
      if (typeof window === "undefined") return () => undefined;
      const timer = window.setInterval(listener, 30_000);
      return () => {
        window.clearInterval(timer);
      };
    },
    () => Math.floor(Date.now() / 30_000),
    () => 0,
  );
  return businessNow();
}

/** Converts a school's local date and time to an absolute instant, including DST offsets. */
export function instantFromSchoolTime(date: string, time: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const target = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(target)) return null;
  if (new Date(target).toISOString().slice(0, 16) !== `${date}T${time}`) return null;
  let guess = target;
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
    const local = Date.parse(
      `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:00Z`,
    );
    guess += target - local;
  }
  if (!Number.isFinite(guess)) return null;
  const result = new Date(guess);
  const roundTrip = schoolDateTime(result, timeZone);
  return roundTrip.date === date && roundTrip.time === time ? result : null;
}

export function schoolDateTime(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

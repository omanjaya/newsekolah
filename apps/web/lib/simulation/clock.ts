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
/** Bumped on every change, for the views that render the simulation. */
let revision = 0;
/**
 * Bumped only when the business clock itself moves: a simulation set,
 * shifted, reset, restored or suspended, or a running one crossing midnight.
 * Learning who the reader is does not move it when no simulation applies,
 * so an ordinary page load keeps its queries (and the server-seeded
 * branding) instead of refetching all of them (SimulationSync).
 */
let clockRevision = 0;
const listeners = new Set<() => void>();

function emit(clockChanged: boolean) {
  revision += 1;
  if (clockChanged) clockRevision += 1;
  listeners.forEach((listener) => {
    listener();
  });
}

/** The simulation `businessNow()` applies right now, or null for the real clock. */
function effectiveClock(): string {
  return active && identity?.allowed ? JSON.stringify(active) : "null";
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
  const clockBefore = effectiveClock();
  active = nextActive;
  identity = nextIdentity;
  if (changed) emit(effectiveClock() !== clockBefore);
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
  emit(true);
}

export function clearSimulation(): void {
  const changed = active !== null;
  const clockBefore = effectiveClock();
  active = null;
  persist(null);
  if (changed) emit(effectiveClock() !== clockBefore);
}

/** Pause requests while an impersonation token replaces the actor; keep the saved clock. */
export function suspendSimulation(): void {
  const clockBefore = effectiveClock();
  active = null;
  identity = null;
  emit(effectiveClock() !== clockBefore);
}

/**
 * The server refused the clock: the actor may no longer simulate. Drops the
 * simulation and its saved copy, and stops this tab from offering a new
 * one until /v1/me says otherwise. Without it an impersonated tab would
 * keep sending the stored clock, since its identity allows the actor's own
 * saved clock without looking at the actor's permissions.
 */
export function refuseSimulation(): void {
  const clockBefore = effectiveClock();
  active = null;
  if (identity) identity = { ...identity, allowed: false };
  persist(null);
  emit(effectiveClock() !== clockBefore);
}

export function notifySimulationDayChange(): void {
  if (active?.mode === "running") emit(true);
}

export function simulationSnapshot() {
  return { active, identity, revision, clockRevision };
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
  return { active, identity, revision, clockRevision };
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

import type { TenantBranding } from "./tenant-provider";

/**
 * The last branding this tab saw, kept in sessionStorage. Storage is per
 * origin and a school is resolved from the host, so the copy always
 * belongs to the school this origin serves. It lets the shell keep naming
 * the school when the public branding endpoint is briefly unavailable (it
 * is rate limited) instead of showing the product name. A per-tab
 * convenience only: never the source of truth, and it fails quietly where
 * storage is blocked.
 */
const STORAGE_KEY = "newsekolah.tenant-branding";

let cachedRaw: string | null = null;
let cachedValue: TenantBranding | undefined;

function isBranding(value: unknown): value is TenantBranding {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { name?: unknown }).name === "string" &&
    (value as { name: string }).name.trim() !== ""
  );
}

/** The stored copy, the same object while the stored text is unchanged (a stable snapshot). */
export function readBrandingSessionCopy(): TenantBranding | undefined {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return undefined;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    cachedValue = isBranding(parsed) ? parsed : undefined;
  } catch {
    cachedValue = undefined;
  }
  return cachedValue;
}

export function writeBrandingSessionCopy(branding: TenantBranding): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(branding));
  } catch {
    // Storage blocked or full: the copy is only a convenience.
  }
}

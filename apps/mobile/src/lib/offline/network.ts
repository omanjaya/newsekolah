// Reachability probe for the offline queue's flush(onlineCheck) guard
// (see queue.ts). The app has no netinfo-style dependency, and adding one
// only for this one boolean is not worth a new native module: a short-timeout
// fetch against the configured API server already answers the only question
// that matters -- can a queued mutation reach the server right now. Any HTTP
// response (even a 4xx/5xx) means the network path works; a thrown error
// (timeout, DNS failure, airplane mode) means it does not.

import { getBaseUrl } from "@/lib/tenant/tenant-store";

const PROBE_TIMEOUT_MS = 4000;

export async function isOnline(): Promise<boolean> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(baseUrl, { method: "HEAD", signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

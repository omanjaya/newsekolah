import { describeUserAgent } from "@newsekolah/api-client";
import { tShared } from "@/i18n/t";
import type { Session } from "@/lib/api/types";

/**
 * What a row in "Sesi aktif" is called: the name the app sent at sign-in,
 * else the browser and system its user agent names ("Chrome di Windows"),
 * else the kind of client in words. Never the raw client enum ("web"),
 * which read as a machine word and named every web session alike. The
 * same chain as the web profile's session list, with the same copy.
 */
export function sessionTitle(session: Session): string {
  if (session.device_name) return session.device_name;
  const { browser, os } = describeUserAgent(session.user_agent);
  if (browser && os) return tShared("auth.sessions.device", { browser, os });
  return browser ?? os ?? tShared(`auth.sessions.client.${session.client}`);
}

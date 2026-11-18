import { useSession } from "../../lib/session/session-provider";

/** The school's IANA timezone, or undefined until the session loads (formatters then use the browser zone). */
export function useTenantTimeZone(): string | undefined {
  const { me } = useSession();
  return me?.tenant.timezone;
}

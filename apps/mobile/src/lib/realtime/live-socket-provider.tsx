// One /ws/me connection per signed-in session, mirroring the shared
// LiveSocketProvider apps/web/lib/realtime is building in parallel (plan
// section 3.3/3.5): screens register interest through useLiveInvalidate and
// useLiveTopic instead of opening a socket each, and topics/backoff/resync
// all live in one place. Mount once, in src/app/_layout.tsx, only while
// signed in -- mounting/unmounting is how this app starts and fully tears
// down the connection, rather than the connection watching auth state
// itself.
import { createContext, useContext, useEffect, useRef } from "react";
import type { PropsWithChildren } from "react";
import { AppState } from "react-native";
import { RealtimeConnection } from "./connection";
import { createRealtimeSocket } from "./socket";
import { getAccessTokenSync, subscribeAccessToken } from "@/lib/auth/token-store";
import { getBaseUrl, getTenantSlug } from "@/lib/tenant/tenant-store";
import { isOnline } from "@/lib/offline/network";

const LiveSocketContext = createContext<RealtimeConnection | null>(null);

export function LiveSocketProvider({ children }: PropsWithChildren): React.JSX.Element {
  const connectionRef = useRef<RealtimeConnection | null>(null);
  connectionRef.current ??= new RealtimeConnection({
    getBaseUrl,
    getTenantSlug,
    getAccessToken: getAccessTokenSync,
    createSocket: createRealtimeSocket,
    isOnline,
    subscribeAppState: (listener) => {
      const subscription = AppState.addEventListener("change", listener);
      return () => subscription.remove();
    },
  });
  const connection = connectionRef.current;

  useEffect(() => {
    connection.start();
    const unsubscribeToken = subscribeAccessToken(() => connection.notifyTokenChanged());
    return () => {
      unsubscribeToken();
      connection.stop();
    };
    // connection is a ref-held singleton for this provider instance's whole
    // lifetime; it is intentionally not in the dependency array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <LiveSocketContext.Provider value={connection}>{children}</LiveSocketContext.Provider>;
}

/** Internal: both hooks below need the live connection instance and throw
 * the same clear error when used outside LiveSocketProvider, matching
 * useAuth's pattern (src/lib/auth/AuthProvider.tsx). */
function useLiveSocketConnection(): RealtimeConnection {
  const connection = useContext(LiveSocketContext);
  if (!connection) throw new Error("Realtime hooks must be used within LiveSocketProvider");
  return connection;
}

// Exported only for the two hook modules in this directory -- screens
// import useLiveInvalidate/useLiveTopic, never this.
export { useLiveSocketConnection };

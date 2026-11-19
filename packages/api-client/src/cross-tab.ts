/**
 * Keeps the browser tabs of one origin from rotating the shared refresh
 * cookie against each other.
 *
 * Every tab keeps its access token in its own memory, but all of them send
 * the same httpOnly refresh cookie, and every refresh rotates it: the
 * server revokes the session the old cookie named. Uncoordinated, two tabs
 * revoke each other in turn, and two refreshes sent with the same cookie
 * at nearly the same moment read as refresh-token reuse, which revokes the
 * whole session family and signs the reader out of every tab.
 *
 * So refreshes run one at a time across tabs (a Web Lock), and each one
 * announces its new access token (a BroadcastChannel). A tab whose token
 * then stops working takes the announced one instead of rotating again.
 */
export interface RefreshCoordinator {
  /** Runs `task` while no other tab of this origin runs one. */
  exclusive<T>(task: () => Promise<T>): Promise<T>;
  /** Tells the other tabs about an access token this tab just obtained. */
  announce(accessToken: string): void;
}

const LOCK_NAME = "newsekolah-refresh";
const CHANNEL_NAME = "newsekolah-auth";

interface AccessTokenAnnouncement {
  type: "access-token";
  accessToken: string;
}

function isAnnouncement(data: unknown): data is AccessTokenAnnouncement {
  const message = data as Partial<AccessTokenAnnouncement> | null;
  return (
    typeof message === "object" &&
    message !== null &&
    message.type === "access-token" &&
    typeof message.accessToken === "string"
  );
}

/**
 * The browser coordinator, or null where Web Locks or BroadcastChannel are
 * missing (React Native, server rendering, very old browsers): those keep
 * refreshing on their own, as before. `onAnnounced` gets every access
 * token another tab announces.
 */
export function createBrowserRefreshCoordinator(
  onAnnounced: (accessToken: string) => void,
): RefreshCoordinator | null {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks || typeof BroadcastChannel === "undefined") {
    return null;
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (isAnnouncement(event.data)) {
      onAnnounced(event.data.accessToken);
    }
  };
  return {
    // The lock is released once the promise `task` returns settles, and
    // `request` resolves with what that promise resolved to.
    exclusive: async (task) => await locks.request(LOCK_NAME, task),
    announce: (accessToken) => {
      const message: AccessTokenAnnouncement = { type: "access-token", accessToken };
      channel.postMessage(message);
    },
  };
}

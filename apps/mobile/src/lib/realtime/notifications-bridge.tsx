// Wires notification_created (apps/api/internal/modules/notifications/
// service/notify.go:89, unchanged in shape from today, plan section 4.1) to
// the notification list and unread-count badge every role's home screen and
// notifications screen already query (src/lib/api/hooks/notifications.ts's
// useNotifications/useUnreadCount) -- mirrors apps/web/features/
// notifications/realtime.ts's own onmessage handler, moved onto the shared
// connection. Mounted once, next to LiveSocketProvider in src/app/_layout.tsx,
// so every screen's badge stays live without each one subscribing itself.
import { queryKeys } from "@newsekolah/api-client";
import { useLiveInvalidate } from "./use-live-invalidate";

const NOTIFICATION_CREATED_EVENTS = ["notification_created"] as const;
const NOTIFICATION_QUERY_KEYS = [["notifications", "list"], queryKeys.notificationsUnreadCount()];

export function NotificationsRealtimeBridge(): null {
  useLiveInvalidate(NOTIFICATION_CREATED_EVENTS, NOTIFICATION_QUERY_KEYS);
  return null;
}

"use client";

import { queryKeys } from "@newsekolah/api-client";
import { useToast } from "@newsekolah/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { LiveEnvelope } from "../../lib/realtime/types";
import { useLiveInvalidate } from "../../lib/realtime/use-live-invalidate";

/**
 * `notify.go`'s `Kind` for a manually published announcement
 * (`notifications/domain/notification.go`'s `KindAnnouncementPublished`).
 * Matching it here is the only way to tell "a notification arrived" apart
 * from "that notification was an announcement", since both ride the same
 * `notification_created` event.
 */
const ANNOUNCEMENT_KIND = "announcement_published";

interface NotificationCreatedPayload {
  kind?: string;
  title?: string;
  body?: string;
}

/**
 * A permits query key broad enough to cover every permits screen a
 * classroom-entry scan could affect (duty desk, live "who just walked in"
 * views), matching `apps/web/features/permits/api.ts`'s own
 * `useInvalidatePermits` -- every query key that module registers is
 * already namespaced under `"permits"`, so this stays correct without
 * this file having to know the individual key shapes permits owns (out of
 * this chunk's scope, see this file's module doc comment).
 */
const PERMITS_QUERY_KEY: readonly unknown[] = ["permits"];

/**
 * App-shell-wide realtime effects that ride LiveSocketProvider's single
 * multiplexed `/ws/me` connection (docs/analysis/realtime-plan-2026-09-25.md
 * chunk D) instead of opening their own socket, as this file did before.
 * Mounted once from apps/web/components/app-shell.tsx, inside
 * `<LiveSocketProvider>`.
 *
 * `notification_created`: identical behavior to the pre-chunk-D socket --
 * invalidates the inbox list and unread count, and shows a toast from the
 * payload's title/body -- plus, per the plan's cheapest "quick win"
 * (section 2, #9), invalidates the announcements feed when the
 * notification's `kind` says it came from a published announcement: that
 * feed used to need a manual refresh even after the toast had already
 * told the reader a new one existed.
 *
 * `classroom_entry_scanned`: dropped silently by the pre-chunk-D client
 * (plan section 1.5 #2 -- `RealtimeMessage` there only ever recognized
 * `notification_created`). The backend has pushed this since
 * `permits/service/scantoken.go`'s `ScanClassroomEntry`; this simply
 * invalidates permits' own query keys so a duty teacher's screen picks up
 * "who just walked in" without a manual refresh. This event does not (yet
 * -- chunk C1) go through `Hub.PublishEvent`, so it still arrives in the
 * old flat shape (`{"type", ...fields, no "payload" wrapper}`); this
 * file's `useLiveInvalidate` only ever reads `envelope.type`, so it needs
 * no special handling either way (see lib/realtime/envelope.ts's doc
 * comment).
 */
export function useNotificationsSocket(): void {
  const queryClient = useQueryClient();
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  });

  useLiveInvalidate(
    ["notification_created"],
    [["notifications", "list"], queryKeys.notificationsUnreadCount()],
    {
      onEvent: (envelope: LiveEnvelope) => {
        const payload = envelope.payload as NotificationCreatedPayload | undefined;
        if (payload?.kind === ANNOUNCEMENT_KIND) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.myAnnouncements() });
        }
        if (payload?.title) {
          toastRef.current.info(
            payload.title,
            payload.body ? { description: payload.body } : undefined,
          );
        }
      },
    },
  );

  useLiveInvalidate(["classroom_entry_scanned"], [PERMITS_QUERY_KEY]);
}

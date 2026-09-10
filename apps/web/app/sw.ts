import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Waits for the UpdateAvailable banner's confirmation (components/update-available.tsx)
  // instead of activating a new version underneath the user without asking.
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: true,
  runtimeCaching: [
    // Navigations: network first (fresh data whenever there is a
    // connection), falling back to the offline page below only when the
    // network genuinely fails, per docs/03 PWA requirement.
    {
      matcher: ({ request }: { request: Request }) => request.mode === "navigate",
      handler: new NetworkFirst({ cacheName: "pages", networkTimeoutSeconds: 10 }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }: { request: Request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | undefined)?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

/**
 * Web Push. The server sends `{title, body, href, data}` (see
 * internal/platform/notify/webpush.go). A payload that will not parse is
 * treated as a plain string body so a malformed message still reaches
 * the reader instead of being dropped silently.
 */
interface PushPayload {
  title?: string;
  body?: string;
  href?: string;
  data?: Record<string, unknown>;
}

function readPayload(event: PushEvent): PushPayload {
  if (!event.data) return {};
  try {
    return event.data.json() as PushPayload;
  } catch {
    return { body: event.data.text() };
  }
}

self.addEventListener("push", (event: PushEvent) => {
  const payload = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Notifikasi", {
      body: payload.body,
      // Grouping by kind means a second notification about the same thing
      // replaces the first instead of stacking up on the lock screen.
      tag: typeof payload.data?.kind === "string" ? payload.data.kind : undefined,
      data: { href: payload.href ?? "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const target =
    (event.notification.data as { href?: string } | undefined)?.href ?? "/notifications";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse a tab that is already open on this origin rather than
      // opening a second one every time a notification is tapped.
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

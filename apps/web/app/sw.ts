import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheExpiration, Serwist } from "serwist";

import { LEGACY_RUNTIME_CACHE_NAMES, deleteAccountScopedCaches } from "../lib/pwa/cache-policy";
import { buildRuntimeCaching } from "../lib/pwa/runtime-caching";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Schools install the app on shared computers, and Cache Storage finds an
 * entry by URL alone, so anything this worker stores is served to whoever
 * signs in next. It therefore stores only what is identical for every
 * account:
 *  - the precache: the build's shared static files, plus the `/offline`
 *    page and the route chunks it loads (`next.config.ts`);
 *  - one runtime cache of `/_next/static/` build output.
 * Navigations always go to the network and are never stored; every other
 * request (API, realtime, RSC payloads, object storage, other origins) is
 * not handled by the worker at all. The rules and the reasons are in
 * `lib/pwa/runtime-caching.ts`; which cache names may exist is decided in
 * `lib/pwa/cache-policy.ts`.
 *
 * This file is bundled by Serwist during `next build` only, outside `tsc`
 * and ESLint, so the logic that needs tests lives in `lib/pwa/`.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Waits for the UpdateAvailable banner's confirmation (components/update-available.tsx)
  // instead of activating a new version underneath the user without asking.
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: true,
  runtimeCaching: buildRuntimeCaching(),
  // A navigation the network cannot answer gets the precached offline page
  // (docs/03 PWA requirement). Serwist attaches this to the runtime
  // strategies, so it applies to the navigation rule.
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

/**
 * Older versions of this worker filled caches with signed-in pages, RSC
 * payloads and API responses (`pages`, `pages-rsc`, `others`, `apis`, ...).
 * Their entries go with the caches; the URLs they were stored under stay
 * behind in the expiration plugin's IndexedDB records, so those are removed
 * by cache name as well. A failure here must not stop the worker from
 * activating: the caches themselves are already gone.
 */
async function forgetAccountScopedCaches(): Promise<void> {
  const removed = await deleteAccountScopedCaches(self.caches);
  const names = new Set<string>([...LEGACY_RUNTIME_CACHE_NAMES, ...removed]);
  await Promise.all(
    [...names].map((name) =>
      new CacheExpiration(name, { maxEntries: 1 }).delete().catch(() => undefined),
    ),
  );
}

// Runs when this version takes over, before it handles a fetch.
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(forgetAccountScopedCaches());
});

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

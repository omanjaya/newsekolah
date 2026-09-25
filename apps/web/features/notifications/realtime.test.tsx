import type * as UiModule from "@newsekolah/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LiveEnvelope } from "../../lib/realtime/types";

const toastMock = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => toastMock };
});

interface Registration {
  eventTypes: readonly string[];
  queryKeys: readonly unknown[][];
  onEvent?: (envelope: LiveEnvelope) => void;
}

/**
 * Isolates useNotificationsSocket from LiveSocketProvider's actual
 * WebSocket/timer machinery (already covered end-to-end by
 * lib/realtime/live-socket-provider.test.tsx): this file only checks that
 * the migrated hook registers the right event types and query keys, and
 * that its `onEvent` handler (the toast + conditional announcements-feed
 * invalidation) behaves correctly once invoked.
 */
const registrations = vi.hoisted(() => [] as Registration[]);
vi.mock("../../lib/realtime/use-live-invalidate", () => ({
  useLiveInvalidate: (
    eventTypes: readonly string[],
    queryKeys: readonly unknown[][],
    options?: { onEvent?: (envelope: LiveEnvelope) => void },
  ) => {
    registrations.push({ eventTypes, queryKeys, onEvent: options?.onEvent });
  },
}));

import { useNotificationsSocket } from "./realtime";

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function notificationCreatedRegistration() {
  return registrations.find((r) => r.eventTypes.includes("notification_created"));
}

beforeEach(() => {
  registrations.length = 0;
  toastMock.info.mockClear();
});

describe("useNotificationsSocket", () => {
  it("registers notification_created against the inbox list and the unread count", () => {
    renderHook(
      () => {
        useNotificationsSocket();
      },
      { wrapper: wrapper(new QueryClient()) },
    );

    const registration = notificationCreatedRegistration();
    expect(registration?.queryKeys).toContainEqual(["notifications", "list"]);
    expect(registration?.queryKeys).toContainEqual(["notifications", "unread-count"]);
  });

  it("shows a toast from the payload's title/body", () => {
    renderHook(
      () => {
        useNotificationsSocket();
      },
      { wrapper: wrapper(new QueryClient()) },
    );

    notificationCreatedRegistration()?.onEvent?.({
      type: "notification_created",
      payload: { title: "Izin disetujui", body: "Wali kelas menyetujui izin Anda" },
    });

    expect(toastMock.info).toHaveBeenCalledWith("Izin disetujui", {
      description: "Wali kelas menyetujui izin Anda",
    });
  });

  it("invalidates the announcements feed when the notification's kind is announcement_published (plan section 2 #9)", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(
      () => {
        useNotificationsSocket();
      },
      { wrapper: wrapper(queryClient) },
    );

    notificationCreatedRegistration()?.onEvent?.({
      type: "notification_created",
      payload: { kind: "announcement_published", title: "Libur nasional" },
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["announcements", "me"] });
  });

  it("leaves the announcements feed alone for a non-announcement notification", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(
      () => {
        useNotificationsSocket();
      },
      { wrapper: wrapper(queryClient) },
    );

    notificationCreatedRegistration()?.onEvent?.({
      type: "notification_created",
      payload: { kind: "leave_request.submitted", title: "Izin diajukan" },
    });

    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["announcements", "me"] });
  });

  it("registers classroom_entry_scanned against permits' query key, dropped silently by the old client", () => {
    renderHook(
      () => {
        useNotificationsSocket();
      },
      { wrapper: wrapper(new QueryClient()) },
    );

    const registration = registrations.find((r) =>
      r.eventTypes.includes("classroom_entry_scanned"),
    );
    expect(registration?.queryKeys).toContainEqual(["permits"]);
  });
});

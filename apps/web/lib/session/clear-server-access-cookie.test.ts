import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STALE_ACCESS_COOKIE_NAME } from "./access-cookie";
import {
  CLEAR_ACCESS_COOKIE_PATH,
  CLEAR_ACCESS_COOKIE_TIMEOUT_MS,
  clearServerAccessCookie,
  retireServerAccessCookie,
  ServerAccessCookieError,
} from "./clear-server-access-cookie";

/** The route answers with this status. */
function routeAnswering(status: number) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The route never answers; the request ends only when it is aborted. */
function routeHanging() {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    ),
  );
}

function staleMarkerSet(): boolean {
  return document.cookie.split("; ").includes(`${STALE_ACCESS_COOKIE_NAME}=1`);
}

beforeEach(() => {
  document.cookie = `${STALE_ACCESS_COOKIE_NAME}=; Max-Age=0; Path=/`;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("clearServerAccessCookie", () => {
  it("asks this app's own route to expire the cookie", async () => {
    const fetchMock = routeAnswering(204);

    await clearServerAccessCookie();

    expect(fetchMock).toHaveBeenCalledWith(
      CLEAR_ACCESS_COOKIE_PATH,
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
  });

  it("fails when the route did not expire it", async () => {
    routeAnswering(403);

    await expect(clearServerAccessCookie()).rejects.toBeInstanceOf(ServerAccessCookieError);
  });

  it("fails when the request does not go through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    await expect(clearServerAccessCookie()).rejects.toBeInstanceOf(ServerAccessCookieError);
  });

  // The privileged switches wait for it: a route that hangs must not leave
  // their button spinning.
  it("gives up once the route has not answered in time", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    routeHanging();

    const outcome = clearServerAccessCookie().then(
      () => "removed",
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(CLEAR_ACCESS_COOKIE_TIMEOUT_MS - 1);
    let settled = false;
    void outcome.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await outcome).toBeInstanceOf(ServerAccessCookieError);
  });
});

// A sign-in must never depend on the route: when it cannot remove the
// cookie, the cookie is marked stale, which the server render and
// middleware honour (lib/session/access-cookie.ts).
describe("retireServerAccessCookie", () => {
  it("removes the cookie through the route and leaves no marker", async () => {
    routeAnswering(204);

    await retireServerAccessCookie();

    expect(staleMarkerSet()).toBe(false);
  });

  it.each([403, 500])("marks the cookie stale when the route answers %i", async (status) => {
    routeAnswering(status);

    await expect(retireServerAccessCookie()).resolves.toBeUndefined();

    expect(staleMarkerSet()).toBe(true);
  });

  it("marks the cookie stale and goes on once the route has not answered in time", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    routeHanging();

    const retired = retireServerAccessCookie();
    await vi.advanceTimersByTimeAsync(CLEAR_ACCESS_COOKIE_TIMEOUT_MS);

    await expect(retired).resolves.toBeUndefined();
    expect(staleMarkerSet()).toBe(true);
  });
});

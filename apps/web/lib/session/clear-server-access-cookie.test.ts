import { afterEach, describe, expect, it, vi } from "vitest";

import { CLEAR_ACCESS_COOKIE_PATH, clearServerAccessCookie } from "./clear-server-access-cookie";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clearServerAccessCookie", () => {
  it("asks this app's own route to expire the cookie", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetchMock);

    await clearServerAccessCookie();

    expect(fetchMock).toHaveBeenCalledWith(CLEAR_ACCESS_COOKIE_PATH, {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("fails when the route did not expire it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 403 }))),
    );

    await expect(clearServerAccessCookie()).rejects.toThrow();
  });
});

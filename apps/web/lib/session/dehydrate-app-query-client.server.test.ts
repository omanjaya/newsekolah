import { afterEach, describe, expect, it, vi } from "vitest";

import { ACCESS_COOKIE_NAME, STALE_ACCESS_COOKIE_NAME } from "./access-cookie";
import { dehydrateAppQueryClient } from "./dehydrate-app-query-client.server";

/** The cookies of the request being rendered. */
const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("server-only", () => ({}));
vi.mock("../env", () => ({ API_INTERNAL_URL: "http://api.internal" }));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = jar.get(name);
        return value === undefined ? undefined : { name, value };
      },
      has: (name: string) => jar.has(name),
    }),
}));

afterEach(() => {
  jar.clear();
  vi.unstubAllGlobals();
});

function meAnswering() {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ id: "teacher" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("dehydrateAppQueryClient", () => {
  it("loads me with the server access cookie", async () => {
    const fetchMock = meAnswering();
    jar.set(ACCESS_COOKIE_NAME, "teacher-token");

    const state = await dehydrateAppQueryClient();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.internal/v1/me",
      expect.objectContaining({ headers: { Authorization: "Bearer teacher-token" } }),
    );
    expect(state.queries.map((query) => query.queryKey)).toEqual([["me"]]);
  });

  // The cookie could not be removed before a sign-in: it may still name the
  // account signed in before, whose `me` would be hydrated over the new one.
  it("does not use a server access cookie the browser marked stale", async () => {
    const fetchMock = meAnswering();
    jar.set(ACCESS_COOKIE_NAME, "previous-token");
    jar.set(STALE_ACCESS_COOKIE_NAME, "1");

    const state = await dehydrateAppQueryClient();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.queries).toEqual([]);
  });
});

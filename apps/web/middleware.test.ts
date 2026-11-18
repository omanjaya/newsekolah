import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { middleware } from "./middleware";

vi.mock("./lib/env", () => ({ API_INTERNAL_URL: "http://api.internal" }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("middleware CSP", () => {
  it("allows blob: frames so the report-header PDF preview can render", async () => {
    const response = await middleware(new NextRequest("https://school.example/settings"));
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    const frameSrc = csp.split("; ").find((directive) => directive.startsWith("frame-src"));
    expect(frameSrc).toContain("blob:");
    expect(frameSrc).toContain("https://accounts.google.com");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

// `sat` is replaced only once it is gone; a sign-in that could not remove
// it marks it stale instead (lib/session/clear-server-access-cookie.ts).
describe("middleware server access cookie", () => {
  function pageLoad(cookie: string): NextRequest {
    return new NextRequest("https://school.example/dashboard", {
      headers: { "sec-fetch-dest": "document", cookie },
    });
  }

  function refreshAnswering(status: number, body: unknown = {}) {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function setCookie(response: Response, name: string): string | undefined {
    return response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
  }

  it("keeps a sat that is not marked stale, without a refresh", async () => {
    const fetchMock = refreshAnswering(200, { access_token: "new-token" });

    const response = await middleware(pageLoad("sat=old-token; refresh_token=r1"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(setCookie(response, "sat")).toBeUndefined();
  });

  it("replaces a sat marked stale from the refresh cookie, and drops the marker", async () => {
    const fetchMock = refreshAnswering(200, { access_token: "new-token" });

    const response = await middleware(pageLoad("sat=old-token; sat_stale=1; refresh_token=r1"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.internal/v1/auth/refresh",
      expect.objectContaining({ method: "POST" }),
    );
    expect(setCookie(response, "sat")).toMatch(/^sat=new-token;/);
    expect(setCookie(response, "sat_stale")).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("removes a sat marked stale, and the marker, when the refresh is refused", async () => {
    refreshAnswering(401, { error: { code: "AUTH_TOKEN_EXPIRED", message: "expired" } });

    const response = await middleware(pageLoad("sat=old-token; sat_stale=1; refresh_token=r1"));

    expect(setCookie(response, "sat")).toContain("Expires=Thu, 01 Jan 1970");
    expect(setCookie(response, "sat_stale")).toContain("Expires=Thu, 01 Jan 1970");
  });
});

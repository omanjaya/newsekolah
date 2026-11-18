import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { CLEAR_ACCESS_COOKIE_PATH } from "../../../../lib/session/clear-server-access-cookie";

import { POST } from "./route";

describe("server access cookie cleanup", () => {
  it("is served at the path the browser helper calls", () => {
    expect(CLEAR_ACCESS_COOKIE_PATH).toBe("/api/session/clear-access-cookie");
  });

  it("deletes sat for a same-origin request, signed in or not", () => {
    const response = POST(
      new NextRequest("https://school.example/api/session/clear-access-cookie", {
        method: "POST",
        headers: { origin: "https://school.example" },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("sat=");
    expect(response.headers.get("set-cookie")).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("rejects a cross-origin request", () => {
    const response = POST(
      new NextRequest("https://school.example/api/session/clear-access-cookie", {
        method: "POST",
        headers: { origin: "https://other.example" },
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("accepts the public origin when Next runs behind the TLS proxy", () => {
    const response = POST(
      new NextRequest("http://web:3000/api/session/clear-access-cookie", {
        method: "POST",
        headers: {
          origin: "https://school.example",
          host: "school.example",
          "x-forwarded-proto": "https",
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("sat=");
  });

  // Every current browser sends Sec-Fetch-Site, and no page can set it: a
  // proxy that rewrites Host or drops the scheme must not lock anyone out.
  it("accepts a fetch the browser marks as same-origin, whatever the proxy forwards", () => {
    const response = POST(
      new NextRequest("http://web:3000/api/session/clear-access-cookie", {
        method: "POST",
        headers: {
          origin: "https://school.example",
          host: "web:3000",
          "sec-fetch-site": "same-origin",
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("sat=");
  });

  it.each(["cross-site", "same-site"])(
    "rejects a fetch the browser marks as %s, whatever its Origin says",
    (site) => {
      const response = POST(
        new NextRequest("https://school.example/api/session/clear-access-cookie", {
          method: "POST",
          headers: { origin: "https://school.example", "sec-fetch-site": site },
        }),
      );
      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  // Browsers without Sec-Fetch-Site fall back to Origin.
  it("accepts the public host a proxy passes in X-Forwarded-Host after rewriting Host", () => {
    const response = POST(
      new NextRequest("http://web:3000/api/session/clear-access-cookie", {
        method: "POST",
        headers: {
          origin: "https://school.example",
          host: "web:3000",
          "x-forwarded-host": "school.example",
          "x-forwarded-proto": "https",
        },
      }),
    );
    expect(response.status).toBe(204);
  });

  it("reads the browser's scheme from the first proxy of a chain", () => {
    const response = POST(
      new NextRequest("http://web:3000/api/session/clear-access-cookie", {
        method: "POST",
        headers: {
          origin: "https://school.example",
          host: "school.example",
          "x-forwarded-proto": "https, http",
        },
      }),
    );
    expect(response.status).toBe(204);
  });
});

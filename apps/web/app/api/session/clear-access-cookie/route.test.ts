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
});

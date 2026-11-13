import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { middleware } from "./middleware";

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

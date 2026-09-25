import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isAuthRedirecting, markAuthRedirect } from "./auth-redirect-flag";

describe("auth-redirect-flag", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is not redirecting before markAuthRedirect is ever called", () => {
    expect(isAuthRedirecting()).toBe(false);
  });

  it("reports redirecting immediately after markAuthRedirect", () => {
    markAuthRedirect();
    expect(isAuthRedirecting()).toBe(true);
  });

  it("stops reporting redirecting once the suppression window elapses", () => {
    markAuthRedirect();
    vi.advanceTimersByTime(2001);
    expect(isAuthRedirecting()).toBe(false);
  });

  it("does not suppress forever -- a later, unrelated 401 still toasts", () => {
    markAuthRedirect();
    vi.advanceTimersByTime(1000);
    expect(isAuthRedirecting()).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(isAuthRedirecting()).toBe(false);
  });
});

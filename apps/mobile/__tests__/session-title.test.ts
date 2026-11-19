import { setLocale } from "@/i18n/t";
import type { Session } from "@/lib/api/types";
import { sessionTitle } from "@/lib/auth/session-title";

function session(overrides: Partial<Session>): Session {
  return {
    id: "s1",
    client: "web",
    created_at: "2026-11-18T01:00:00Z",
    last_seen_at: "2026-11-19T01:00:00Z",
    is_current: false,
    ...overrides,
  };
}

const CHROME_ON_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

describe("sessionTitle", () => {
  beforeEach(() => {
    setLocale("id");
  });

  it("keeps the name the app sent at sign-in", () => {
    expect(sessionTitle(session({ client: "android", device_name: "Pixel 8" }))).toBe("Pixel 8");
  });

  it("names the browser and system a web sign-in's user agent names", () => {
    expect(sessionTitle(session({ user_agent: CHROME_ON_WINDOWS }))).toBe("Chrome di Windows");
    setLocale("en");
    expect(sessionTitle(session({ user_agent: CHROME_ON_WINDOWS }))).toBe("Chrome on Windows");
  });

  it("falls back to the kind of client in words, never the raw enum", () => {
    expect(sessionTitle(session({}))).toBe("Peramban web");
    expect(sessionTitle(session({ client: "ios", user_agent: "NewsekolahApp/1.0" }))).toBe(
      "Aplikasi iOS",
    );
    expect(sessionTitle(session({ client: "android" }))).toBe("Aplikasi Android");
  });
});

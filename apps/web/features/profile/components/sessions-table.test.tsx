import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionsTable } from "./sessions-table";

const sessions = vi.hoisted(() => ({
  data: [
    {
      id: "s1",
      client: "web",
      user_agent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      created_at: "2026-11-18T01:00:00Z",
      last_seen_at: "2026-11-19T01:00:00Z",
      is_current: true,
    },
    {
      id: "s2",
      client: "android",
      device_name: "Pixel 8",
      created_at: "2026-11-18T01:00:00Z",
      last_seen_at: "2026-11-18T02:00:00Z",
      is_current: false,
    },
    {
      id: "s3",
      client: "web",
      created_at: "2026-11-18T01:00:00Z",
      last_seen_at: "2026-11-18T03:00:00Z",
      is_current: false,
    },
    {
      id: "s4",
      client: "ios",
      user_agent: "NewsekolahApp/1.0",
      created_at: "2026-11-18T01:00:00Z",
      last_seen_at: "2026-11-18T04:00:00Z",
      is_current: false,
    },
  ],
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../api", () => ({
  useSessionsQuery: () => ({ data: sessions, isLoading: false, isError: false }),
  useRevokeSessionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("SessionsTable", () => {
  it("names each session by its device, browser or kind of app, never the raw client enum", () => {
    render(<SessionsTable />);

    // The browser and system the user agent names.
    expect(screen.getByText("device:Chrome,Windows")).toBeInTheDocument();
    // The name the app sent at sign-in wins.
    expect(screen.getByText("Pixel 8")).toBeInTheDocument();
    // Nothing to go on: the kind of client, in words.
    expect(screen.getByText("client.web")).toBeInTheDocument();
    expect(screen.getByText("client.ios")).toBeInTheDocument();
    expect(screen.queryByText("web")).not.toBeInTheDocument();
  });
});

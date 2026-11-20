import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import AnnouncementPage from "./page";

describe("AnnouncementPage", () => {
  it("sends an older notification's /announcements/{id} link to the feed opened on it", async () => {
    await AnnouncementPage({ params: Promise.resolve({ id: "a-1" }) });
    expect(redirect).toHaveBeenCalledWith("/announcements?focus=a-1");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { writeUrlHistory } from "./url-history";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("writeUrlHistory", () => {
  it("makes every write of one action a single history entry", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    // "Hapus semua filter": each filter clears itself in turn.
    writeUrlHistory("/settings/audit-logs?from=2030-01-01", "push");
    writeUrlHistory("/settings/audit-logs", "push");

    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("");

    // The next action is a task of its own and adds its own entry.
    await Promise.resolve();
    writeUrlHistory("/settings/audit-logs?entity_type=user", "push");
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("replaces the entry when asked, without using up the action's push", async () => {
    await Promise.resolve();
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    writeUrlHistory("/x?a=1", "replace");
    writeUrlHistory("/x?a=2", "push");

    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
  });
});

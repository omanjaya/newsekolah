import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const summary = vi.hoisted(() => vi.fn());
const access = vi.hoisted(() => vi.fn());

vi.mock("../../../inbox/use-action-inbox-count", () => ({ useActionInboxSummary: summary }));
vi.mock("../../../inbox/lib/access", () => ({ useInboxAccess: access }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

import type { Me } from "../types";

import { useDeputyBlock } from "./deputy";

const me = {} as Me;
const counts = (patch: Partial<Record<string, number | boolean>> = {}) => ({
  leave: 0,
  exit: 0,
  late: 0,
  warningLetters: 0,
  total: 0,
  isLoading: false,
  isError: false,
  ...patch,
});

beforeEach(() => {
  access.mockReturnValue({ leave: true, exit: true, late: true, warningLetters: false });
});

describe("useDeputyBlock", () => {
  it("leads with the decisions waiting in the action inbox", () => {
    summary.mockReturnValue(counts({ leave: 2, late: 1, total: 3 }));
    const { result } = renderHook(() => useDeputyBlock(me, true));
    expect(result.current.hero?.key).toBe("deputy.inbox");
    expect(result.current.hero?.action?.href).toBe("/inbox");
    expect(result.current.tiles[0]?.value).toBe("3");
    render(<>{result.current.main[0]?.node}</>);
    expect(screen.getByRole("link", { name: /queues.leave/ })).toHaveAttribute(
      "href",
      "/leave-requests",
    );
    expect(screen.queryByText("queues.warningLetters")).not.toBeInTheDocument();
  });

  it("opens on a calm hero leading to the reports when nothing waits", () => {
    summary.mockReturnValue(counts());
    const { result } = renderHook(() => useDeputyBlock(me, true));
    expect(result.current.hero?.key).toBe("deputy.idle");
    expect(result.current.hero?.tone).toBe("neutral");
    expect(result.current.hero?.action?.href).toBe("/reports");
  });

  it("stays pending and heroless while the counts load", () => {
    summary.mockReturnValue(counts({ isLoading: true }));
    const { result } = renderHook(() => useDeputyBlock(me, true));
    expect(result.current.pending).toBe(true);
    expect(result.current.hero).toBeUndefined();
  });
});

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VisitKioskView } from "./visit-kiosk-view";

const mutate = vi.hoisted(() => vi.fn());
const issueState = vi.hoisted(() => {
  const current: Record<string, unknown> = { data: undefined, isError: false, isPending: false };
  return { current };
});

vi.mock("../visits-api", () => ({
  useIssueLibraryKioskTokenMutation: () => ({ mutate, ...issueState.current }),
}));
vi.mock("../../permits/api", () => ({ encodeScanPayload: () => "sion:payload" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

describe("VisitKioskView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mutate.mockReset();
    issueState.current = { data: undefined, isError: false, isPending: false };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mints the next token when the current one expires, without a click", () => {
    issueState.current = {
      data: { token: "tok", expires_at: new Date(Date.now() + 30_000).toISOString() },
      isError: false,
      isPending: false,
    };
    render(<VisitKioskView />);
    expect(mutate).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it("shows an error with a retry button instead of an endless skeleton", () => {
    issueState.current = { data: undefined, isError: true, isPending: false };
    render(<VisitKioskView />);

    expect(screen.getByText("issueFailedTitle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "retry" })).toBeInTheDocument();
  });

  it("retries by itself after a failed renewal and keeps the last QR meanwhile", () => {
    issueState.current = {
      data: { token: "tok", expires_at: new Date(Date.now() + 30_000).toISOString() },
      isError: false,
      isPending: false,
    };
    const { rerender } = render(<VisitKioskView />);
    mutate.mockClear();

    issueState.current = { data: undefined, isError: true, isPending: false };
    rerender(<VisitKioskView />);

    expect(screen.getByText("issueFailedTitle")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});

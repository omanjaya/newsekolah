import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Same isolation approach as use-live-invalidate.test.tsx -- decouples the indicator's own timing logic from LiveSocketProvider's socket/timer machinery, already covered by live-socket-provider.test.tsx. */
const state = vi.hoisted(() => ({ status: "open" }));

vi.mock("./live-socket-provider", () => ({
  useLiveSocketStatus: () => state.status,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { ConnectionStatusIndicator } from "./connection-status-indicator";

/** Mirrors this component's own private threshold. */
const SUSTAINED_DISCONNECT_MS = 8_000;

beforeEach(() => {
  vi.useFakeTimers();
  state.status = "open";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ConnectionStatusIndicator", () => {
  it("stays hidden while connected", () => {
    const { queryByRole } = render(<ConnectionStatusIndicator />);
    expect(queryByRole("status")).toBeNull();
  });

  it("stays hidden through a brief reconnect, shorter than the sustained threshold", () => {
    const { rerender, queryByRole } = render(<ConnectionStatusIndicator />);
    state.status = "reconnecting";
    rerender(<ConnectionStatusIndicator />);

    act(() => {
      vi.advanceTimersByTime(SUSTAINED_DISCONNECT_MS - 1);
    });

    expect(queryByRole("status")).toBeNull();
  });

  it("appears once a disconnect has stayed down for the sustained threshold", () => {
    const { rerender, queryByRole } = render(<ConnectionStatusIndicator />);
    state.status = "connecting";
    rerender(<ConnectionStatusIndicator />);

    act(() => {
      vi.advanceTimersByTime(SUSTAINED_DISCONNECT_MS);
    });

    expect(queryByRole("status")).not.toBeNull();
  });

  it("hides again immediately once the connection recovers", () => {
    const { rerender, queryByRole } = render(<ConnectionStatusIndicator />);
    state.status = "reconnecting";
    rerender(<ConnectionStatusIndicator />);
    act(() => {
      vi.advanceTimersByTime(SUSTAINED_DISCONNECT_MS);
    });
    expect(queryByRole("status")).not.toBeNull();

    state.status = "open";
    rerender(<ConnectionStatusIndicator />);

    expect(queryByRole("status")).toBeNull();
  });

  it("never shows for a deliberate pause (hidden tab), even after a long wait", () => {
    const { rerender, queryByRole } = render(<ConnectionStatusIndicator />);
    state.status = "paused";
    rerender(<ConnectionStatusIndicator />);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(queryByRole("status")).toBeNull();
  });

  it("never shows while idle (no signed-in user yet)", () => {
    const { rerender, queryByRole } = render(<ConnectionStatusIndicator />);
    state.status = "idle";
    rerender(<ConnectionStatusIndicator />);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(queryByRole("status")).toBeNull();
  });
});

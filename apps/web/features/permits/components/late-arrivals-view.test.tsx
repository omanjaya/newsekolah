import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  current: {},
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../components/query-error", () => ({
  QueryError: () => <div data-testid="query-error" />,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { profile_kind: "student", tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../lib/use-can-submit-permit", () => ({ useCanSubmitPermit: () => true }));
vi.mock("../api", () => ({
  decodeScanPayload: (raw: string) => ({ token: raw }),
  useCurrentLateArrivalQuery: () => mocks.current,
  useLateArrivalQuery: () => ({ data: undefined }),
  useOpenLateArrivalMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReviewLateArrivalMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useScanLateArrivalStageMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { LateArrivalsView } from "./late-arrivals-view";

beforeEach(() => {
  mocks.current = { isLoading: false, isError: false, data: null, refetch: vi.fn() };
});

describe("LateArrivalsView for a student", () => {
  it("offers the desk check-in when no late arrival is open", () => {
    render(<LateArrivalsView />);
    expect(screen.getByText("scanTitle")).toBeInTheDocument();
    // The desk QR prints no code: the typed field is for a hardware
    // scanner, and the page says what to do without a camera.
    expect(screen.getByText("cannotScanHint")).toBeInTheDocument();
    expect(screen.queryByTestId("query-error")).not.toBeInTheDocument();
  });

  it("shows the error, not a second check-in, when the current late arrival fails to load", () => {
    mocks.current = {
      isLoading: false,
      isError: true,
      error: new Error("500"),
      data: undefined,
      refetch: vi.fn(),
    };
    render(<LateArrivalsView />);
    expect(screen.getByTestId("query-error")).toBeInTheDocument();
    expect(screen.queryByText("scanTitle")).not.toBeInTheDocument();
  });
});

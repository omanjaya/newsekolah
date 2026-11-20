import { ApiError } from "@newsekolah/api-client";
import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted<{ error: unknown; data: unknown }>(() => ({
  error: null,
  data: undefined,
}));
const mounts = vi.hoisted(() => ({ count: 0 }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("./session-editor", () => ({
  SessionEditor: function SessionEditorStub() {
    const [mount] = useState(() => ++mounts.count);
    return <div>editor {mount}</div>;
  },
}));
vi.mock("../api", () => ({
  useSessionQuery: () => ({
    data: query.data,
    isLoading: false,
    error: query.error,
    isRefetchError: false,
    refetch: vi.fn(),
  }),
}));

import { SessionView } from "./session-view";

beforeEach(() => {
  query.error = null;
  query.data = undefined;
  mounts.count = 0;
});

describe("SessionView", () => {
  it("shows the not-found page for a malformed session id", () => {
    query.error = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "invalid",
      details: [{ field: "sessionId", code: "INVALID_FORMAT" }],
    });
    render(<SessionView sessionId="abc" />);

    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToList" })).toHaveAttribute("href", "/attendance");
    expect(screen.queryByRole("button", { name: "actions.retry" })).not.toBeInTheDocument();
  });

  it("shows the not-found page for an unknown session", () => {
    query.error = new ApiError({ status: 404, code: "NOT_FOUND", message: "missing" });
    render(<SessionView sessionId="00000000-0000-0000-0000-000000000000" />);

    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
  });

  it("keeps a retry for a load that failed", () => {
    query.error = new ApiError({ status: 503, code: "UNAVAILABLE", message: "down" });
    render(<SessionView sessionId="00000000-0000-0000-0000-000000000001" />);

    expect(screen.queryByText("notFoundTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("starts a fresh editor when the page switches to correction mode", () => {
    query.data = { id: "s1", submitted_at: "2027-01-04T01:00:00Z" };
    const { rerender } = render(<SessionView sessionId="s1" />);
    expect(screen.getByText("editor 1")).toBeInTheDocument();

    rerender(<SessionView sessionId="s1" openedInCorrection />);

    // A save error from normal mode does not linger in correction mode.
    expect(screen.getByText("editor 2")).toBeInTheDocument();
  });
});

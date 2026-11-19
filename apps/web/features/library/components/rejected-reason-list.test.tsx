import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RejectedReasonList } from "./rejected-reason-list";

vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string, fallback?: string) =>
    code.startsWith("LIBRARY_") ? `translated ${code}` : (fallback ?? "unknown"),
}));

describe("RejectedReasonList", () => {
  it("shows each row's label with its translated code, not the server text", () => {
    render(
      <RejectedReasonList
        items={[
          {
            key: "1",
            label: "Budi",
            code: "LIBRARY_MEMBER_SUSPENDED",
            reason: "library member is suspended",
          },
          {
            key: "2",
            label: "Eka",
            code: "LIBRARY_NO_COPY_AVAILABLE",
            reason: "no copy available",
          },
        ]}
      />,
    );
    expect(screen.getByText("Budi: translated LIBRARY_MEMBER_SUSPENDED")).toBeInTheDocument();
    expect(screen.getByText("Eka: translated LIBRARY_NO_COPY_AVAILABLE")).toBeInTheDocument();
    expect(screen.queryByText(/no copy available/)).not.toBeInTheDocument();
  });

  it("falls back to the server text for a code the catalog does not know", () => {
    render(
      <RejectedReasonList
        items={[{ key: "1", label: "Citra", code: "INTERNAL_ERROR", reason: "boom" }]}
      />,
    );
    expect(screen.getByText("Citra: boom")).toBeInTheDocument();
  });
});

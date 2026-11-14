import { ApiError } from "@newsekolah/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VerifyView } from "./verify-view";

const get = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/api/client", () => ({ useApiClient: () => ({ GET: get }) }));
vi.mock("../../../lib/tenant/tenant-provider", () => ({
  useTenant: () => ({ displayName: "SMA 1 Denpasar", branding: undefined, isLoading: false }),
}));
vi.mock("next-intl", () => {
  const t = Object.assign(
    (key: string, values?: Record<string, string>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
    { has: () => false },
  );
  return { useLocale: () => "id", useTranslations: () => t };
});

const DOC = {
  number: "SI/2026/11/0042",
  kind: "leave_letter",
  issued_at: "2026-11-12T01:30:00Z",
  student_name: "Nadia",
  class_name: "XI IPA 2",
  revoked: false,
};

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <VerifyView code="SI-0042" />
    </QueryClientProvider>,
  );
}

describe("VerifyView", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("makes a genuine document the verdict, naming the issuing school, then its facts", async () => {
    get.mockResolvedValue(DOC);
    renderView();
    expect(
      await screen.findByRole("heading", { level: 1, name: "validTitle" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("validBody SMA 1 Denpasar");
    expect(screen.getByText("SI/2026/11/0042")).toBeInTheDocument();
    expect(screen.getByText("SI-0042")).toBeInTheDocument();
  });

  it("announces a revoked document at once", async () => {
    get.mockResolvedValue({ ...DOC, revoked: true });
    renderView();
    expect(await screen.findByRole("alert")).toHaveTextContent("revokedTitle");
  });

  it("shows the code it checked when no document matches", async () => {
    get.mockRejectedValue(new ApiError({ status: 404, code: "NOT_FOUND", message: "x" }));
    renderView();
    expect(
      await screen.findByRole("heading", { level: 1, name: "notFoundTitle" }),
    ).toBeInTheDocument();
    expect(screen.getByText("SI-0042")).toBeInTheDocument();
  });

  it("offers a retry, not an 'unknown' verdict, when the check itself fails", async () => {
    get.mockRejectedValue(new ApiError({ status: 500, code: "INTERNAL", message: "x" }));
    renderView();
    expect(
      await screen.findByRole("heading", { level: 1, name: "errorTitle" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "retry" })).toBeInTheDocument();
    expect(screen.queryByText("notFoundTitle")).not.toBeInTheDocument();
  });
});

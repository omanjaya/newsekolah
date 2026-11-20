import { ApiError } from "@newsekolah/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setDocumentSchoolName } from "../../../lib/page-title";

import { VerifyView } from "./verify-view";

const get = vi.hoisted(() => vi.fn());
const tenant = vi.hoisted(() => ({ branding: undefined as { timezone: string } | undefined }));

vi.mock("../../../lib/api/client", () => ({ useApiClient: () => ({ GET: get }) }));
vi.mock("../../../lib/tenant/tenant-provider", () => ({
  useTenant: () => ({ displayName: "SMA 1 Denpasar", branding: tenant.branding, isLoading: false }),
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
    tenant.branding = undefined;
  });

  it("names every issued kind, and never shows a raw kind code", async () => {
    get.mockResolvedValue({ ...DOC, kind: "receipt" });
    renderView();
    expect(await screen.findByText("kinds.receipt")).toBeInTheDocument();
  });

  it("falls back to a generic label for a kind it does not know", async () => {
    get.mockResolvedValue({ ...DOC, kind: "some_future_kind" });
    renderView();
    expect(await screen.findByText("kindOther")).toBeInTheDocument();
    expect(screen.queryByText("some_future_kind")).not.toBeInTheDocument();
  });

  it("shows the issue time in the school's zone and names it, whatever the viewer's zone", async () => {
    tenant.branding = { timezone: "Asia/Makassar" };
    get.mockResolvedValue({ ...DOC, issued_at: "2026-11-20T02:02:16Z" });
    renderView();
    expect(await screen.findByText("20 November 2026 pukul 10.02 WITA")).toBeInTheDocument();
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

  it("treats a malformed code as unknown, not as a failed check", async () => {
    get.mockRejectedValue(new ApiError({ status: 400, code: "VALIDATION_FAILED", message: "x" }));
    renderView();
    expect(
      await screen.findByRole("heading", { level: 1, name: "notFoundTitle" }),
    ).toBeInTheDocument();
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

  it("names the tab after the check while it runs, then after the verdict", async () => {
    setDocumentSchoolName("SMA Contoh");
    let resolve: (doc: typeof DOC) => void = () => undefined;
    get.mockReturnValue(
      new Promise<typeof DOC>((done) => {
        resolve = done;
      }),
    );
    renderView();
    expect(document.title).toBe("title · SMA Contoh");

    resolve({ ...DOC, revoked: true });
    await waitFor(() => {
      expect(document.title).toBe("revokedTitle · SMA Contoh");
    });
  });
});

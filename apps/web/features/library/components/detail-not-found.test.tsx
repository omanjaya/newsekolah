import { ApiError } from "@newsekolah/api-client";
import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The library's two record pages keyed by an id in the address: a wrong
// link is a missing record with a way back, not "Coba lagi".
const query = vi.hoisted<{ error: unknown }>(() => ({ error: null }));
const failed = vi.hoisted(() => () => ({
  data: undefined,
  isLoading: false,
  isError: true,
  error: query.error,
  refetch: () => undefined,
}));
const empty = vi.hoisted(() => () => ({ data: undefined, isLoading: false, isError: false }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/library",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("../../reference/api", () => ({ useLookup: () => new Map() }));
vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Makassar" }));
vi.mock("../api", () => ({
  printCopyLabel: vi.fn(),
  printMemberCard: vi.fn(),
  useLibraryTitleQuery: failed,
  useLibraryCopiesQuery: empty,
  useReservationQueueQuery: empty,
  useMemberLoanHistoryQuery: empty,
  useMemberReservationsQuery: empty,
}));
vi.mock("../members-api", () => ({
  printLibraryClearanceLetter: vi.fn(),
  useClearLibraryMemberMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useLibraryMemberQuery: failed,
  useLibraryMemberTypesQuery: empty,
}));
vi.mock("../violations-api", () => ({ useMemberViolationsQuery: empty }));

import { MemberDetailView } from "./member-detail-view";
import { TitleDetailView } from "./title-detail-view";

const malformed = () =>
  new ApiError({
    status: 400,
    code: "VALIDATION_FAILED",
    message: "invalid",
    details: [{ field: "titleId", code: "INVALID_FORMAT" }],
  });

beforeEach(() => {
  query.error = null;
});

describe("TitleDetailView", () => {
  it("shows the not-found page for a malformed title id", () => {
    query.error = malformed();
    render(<TitleDetailView titleId="abc" />);

    expect(screen.getByRole("heading", { name: "missingTitle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToCatalogue" })).toHaveAttribute(
      "href",
      "/library/catalogue",
    );
    expect(screen.queryByRole("button", { name: "actions.retry" })).not.toBeInTheDocument();
  });

  it("shows the not-found page for an unknown title", () => {
    query.error = new ApiError({
      status: 404,
      code: "LIBRARY_TITLE_NOT_FOUND",
      message: "missing",
    });
    render(<TitleDetailView titleId="00000000-0000-0000-0000-000000000000" />);

    expect(screen.getByRole("heading", { name: "missingTitle" })).toBeInTheDocument();
  });

  it("keeps a retry for a load that failed", () => {
    query.error = new ApiError({ status: 503, code: "UNAVAILABLE", message: "down" });
    render(<TitleDetailView titleId="00000000-0000-0000-0000-000000000001" />);

    expect(screen.queryByText("missingTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("MemberDetailView", () => {
  it("shows the not-found page for an unknown member", () => {
    query.error = new ApiError({
      status: 404,
      code: "LIBRARY_MEMBER_NOT_FOUND",
      message: "missing",
    });
    render(<MemberDetailView userId="00000000-0000-0000-0000-000000000000" />);

    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToList" })).toHaveAttribute(
      "href",
      "/library/members",
    );
  });

  it("shows the not-found page for a malformed member id", () => {
    query.error = malformed();
    render(<MemberDetailView userId="abc" />);

    expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
  });

  it("keeps a retry for a load that failed", () => {
    query.error = new ApiError({ status: 503, code: "UNAVAILABLE", message: "down" });
    render(<MemberDetailView userId="00000000-0000-0000-0000-000000000001" />);

    expect(screen.queryByText("notFoundTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

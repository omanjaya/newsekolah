import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { KioskView } from "./kiosk-view";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Jakarta" }));
vi.mock("../api", () => ({
  useBorrowLoanMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useReturnLoanMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../kiosk-session", () => ({
  looksLikeMemberCard: () => false,
  useKioskMemberSession: () => ({ findLoanForBarcode: () => undefined }),
}));
vi.mock("./kiosk-member-panel", () => ({ KioskMemberPanel: () => null }));

describe("KioskView", () => {
  it("titles the idle screen with the page heading, like the visit kiosk", () => {
    render(<KioskView />);
    expect(screen.getByRole("heading", { level: 1, name: "idle.title" })).toBeInTheDocument();
  });
});

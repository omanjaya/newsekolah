import type * as UiModule from "@newsekolah/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryPolicy, LibraryTitle } from "../api";

import { CatalogueView } from "./catalogue-view";
import { LibraryPolicyDialog } from "./library-policy-dialog";
import { MemberProfileForm } from "./member-profile-form";
import { TitleForm } from "./title-form";

const mocks = vi.hoisted(() => ({
  updateTitle: vi.fn(),
  createTitle: vi.fn(),
  updateMember: vi.fn(),
  updatePolicy: vi.fn(),
  push: vi.fn(),
  canManage: true,
}));
const title: LibraryTitle = {
  id: "title-1",
  title: "Original title",
  author: "Author",
  publisher: "Publisher",
  isbn: "1234567890",
  classification: "500",
  language: "id",
  is_opac: false,
  edition: "Second",
  call_number: "500 AUT O",
  control_number: "CTRL-1",
  total_copies: 2,
  available_copies: 1,
  loanable_available_copies: 1,
};
const policy: LibraryPolicy = {
  version: 2,
  name: "School library",
  loan_days: 7,
  max_active_loans: 3,
  max_renewals: 2,
  renewal_days: 3,
  fine_per_day: 1000,
  reservation_hold_days: 2,
  barcode_source: "no_induk",
  accession_format: "YYYY/99999",
  member_no_format: "M/99999",
  saturday_closed: true,
  sunday_closed: true,
  booking_enabled: true,
  booking_max: 2,
  fine_currency_enabled: true,
  block_loans_with_unpaid_fines: true,
  due_reminder_days: 2,
  auto_register_members: false,
};
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/library/catalogue",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => mocks.canManage }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/view-state/view-state-provider", () => ({
  useRememberedViewState: () => ["", vi.fn()],
}));
vi.mock("../api", () => ({
  useLibraryTitlesQuery: () => ({ data: { data: [title] }, isLoading: false }),
  useCreateLibraryTitleMutation: () => ({ mutate: mocks.createTitle, isPending: false }),
  useUpdateLibraryTitleMutation: () => ({ mutate: mocks.updateTitle, isPending: false }),
  useDeleteLibraryTitleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLibraryPolicyQuery: () => ({ data: policy, isLoading: false, isError: false }),
  useUpdateLibraryPolicyMutation: () => ({ mutate: mocks.updatePolicy, isPending: false }),
  downloadLibraryCatalogueExportXlsx: vi.fn(),
}));
vi.mock("../master-data-api", () => ({
  useLibraryCatalogueOptionsQuery: () => ({ data: { material_types: [] }, isLoading: false }),
}));
vi.mock("../members-api", () => ({
  useLibraryMemberTypesQuery: () => ({ data: { data: [{ id: "type-1", name: "Student" }] } }),
  useUpdateLibraryMemberMutation: () => ({ mutate: mocks.updateMember, isPending: false }),
}));
vi.mock("./duplicate-title-warning", () => ({ DuplicateTitleWarning: () => null }));
vi.mock("./isbn-lookup-panel", () => ({ IsbnLookupField: () => null }));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

describe("library editors", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {
          return undefined;
        }
        unobserve() {
          return undefined;
        }
        disconnect() {
          return undefined;
        }
      },
    );
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canManage = true;
  });

  it("updates a title while preserving metadata and its hidden OPAC status", async () => {
    const user = userEvent.setup();
    render(<CatalogueView />);
    // Edit/delete sit behind the row's "..." menu (docs/07-ui-ux.md: never
    // bare icons), so the menu has to open before its "editTitle" item
    // becomes visible.
    const rowMenuButton = screen.getAllByRole("button", { name: "rowActions" })[0];
    if (!rowMenuButton) throw new Error("Missing title row actions menu");
    await user.click(rowMenuButton);
    const editButton = await screen.findByRole("menuitem", { name: "editTitle" });
    await user.click(editButton);
    const titleInput = screen.getByRole("textbox", { name: "title" });
    await user.clear(titleInput);
    await user.type(titleInput, "Revised title");
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(mocks.updateTitle).toHaveBeenCalledWith(
      expect.objectContaining({
        titleId: title.id,
        title: "Revised title",
        edition: "Second",
        call_number: title.call_number,
        control_number: title.control_number,
        is_opac: false,
      }),
      expect.any(Object),
    );
    expect(mocks.createTitle).not.toHaveBeenCalled();
    // The row opens the title's page (75082415); its "..." menu must edit
    // in place without that navigation firing too.
    expect(mocks.push).not.toHaveBeenCalled();
  });

  // The form had no DDC, call number or visibility field: a title entered
  // by hand got a call number without its class number, and a title that
  // was hidden (every imported one) could never be made public.
  it("sends the DDC number, a typed call number and the visibility switch", async () => {
    const user = userEvent.setup();
    render(<TitleForm onDone={vi.fn()} />);
    await user.type(screen.getByRole("textbox", { name: "title" }), "Bumi Manusia");
    await user.type(screen.getByRole("textbox", { name: "ddcNumber" }), "899.221");
    expect(screen.getByRole("switch", { name: "isOpac" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "save" }));
    const created: unknown = mocks.createTitle.mock.calls[0]?.[0];
    expect(created).toEqual(
      expect.objectContaining({ title: "Bumi Manusia", ddc_number: "899.221", is_opac: true }),
    );
    // Left empty, the call number is generated by the API.
    expect(created).not.toHaveProperty("call_number", expect.anything());
  });

  it("lets a hidden title be made public and its call number cleared for regeneration", async () => {
    const user = userEvent.setup();
    render(<TitleForm initial={title} onDone={vi.fn()} />);
    const visibility = screen.getByRole("switch", { name: "isOpac" });
    expect(visibility).not.toBeChecked();
    await user.click(visibility);
    await user.clear(screen.getByRole("textbox", { name: "callNumber" }));
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(mocks.updateTitle).toHaveBeenCalledWith(
      expect.objectContaining({ titleId: title.id, is_opac: true, call_number: undefined }),
      expect.any(Object),
    );
  });

  it("hides catalogue write actions for readers", () => {
    mocks.canManage = false;
    render(<CatalogueView />);
    expect(screen.queryByRole("menuitem", { name: "editTitle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "addTitle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "deleteTitle" })).not.toBeInTheDocument();
  });

  it("clears member expiry without changing their status", async () => {
    const user = userEvent.setup();
    render(
      <MemberProfileForm
        member={{
          user_id: "member-1",
          member_no: "M1",
          member_type_id: "type-1",
          registered_on: "2026-01-01",
          valid_until: "2026-12-31",
          status: "suspended",
          late_return_count: 1,
        }}
        onDone={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Hapus tanggal" }));
    await user.click(screen.getByRole("button", { name: "save" }));
    const payload: unknown = mocks.updateMember.mock.calls[0]?.[0];
    expect(payload).toEqual({
      userId: "member-1",
      member_type_id: "type-1",
      valid_until: undefined,
      notes: "",
    });
    expect(payload).not.toHaveProperty("status");
  });

  it("preserves all policy toggles when changing the loan duration", async () => {
    const user = userEvent.setup();
    render(<LibraryPolicyDialog />);
    await user.click(screen.getByRole("button", { name: "title" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "loan_days" }), {
      target: { value: "14" },
    });
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(mocks.updatePolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        ...policy,
        loan_days: 14,
      }),
      expect.any(Object),
    );
  });
});

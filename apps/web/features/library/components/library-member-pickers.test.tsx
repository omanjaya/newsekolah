import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordVisit: vi.fn(),
  startReading: vi.fn(),
  createViolation: vi.fn(),
  register: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../visits-api", () => ({
  useRecordLibraryVisitMutation: () => ({ mutate: mocks.recordVisit, isPending: false }),
  useLibraryReadInPlaceQuery: () => ({ data: { data: [] }, isLoading: false }),
  useStartLibraryReadInPlaceMutation: () => ({ mutate: mocks.startReading, isPending: false }),
}));
vi.mock("../violations-api", () => ({
  useCreateLibraryViolationMutation: () => ({ mutate: mocks.createViolation, isPending: false }),
}));
vi.mock("../members-api", () => ({
  useLibraryMemberTypesQuery: () => ({
    data: { data: [{ id: "type-1", name: "Siswa" }] },
    isLoading: false,
  }),
  useRegisterLibraryMemberMutation: () => ({ mutate: mocks.register, isPending: false }),
}));

import { MemberRegisterForm } from "./member-register-form";
import { ReadInPlaceDialog } from "./read-in-place-dialog";
import { ViolationRecordDialog } from "./violation-record-dialog";
import { VisitRecordDialog } from "./visit-record-dialog";

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
});

describe("library member pickers", () => {
  it("records a visit for the member picked from the whole school", async () => {
    const user = userEvent.setup();
    render(<VisitRecordDialog open onOpenChange={vi.fn()} onRecorded={vi.fn()} />);

    const picker = screen.getByRole("combobox", { name: "memberPlaceholder" });
    expect(picker).toHaveAttribute("data-kind", "all");
    await user.click(picker);
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mocks.recordVisit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "member", member_user_id: "picked-1" }),
      expect.any(Object),
    );
  });

  it("starts reading in place for the picked member", async () => {
    const user = userEvent.setup();
    render(<ReadInPlaceDialog copyId="copy-1" onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "memberPlaceholder" }));
    await user.click(screen.getByRole("button", { name: "start" }));

    expect(mocks.startReading).toHaveBeenCalledWith(
      expect.objectContaining({ member_user_id: "picked-1" }),
      expect.any(Object),
    );
  });

  it("opens the violation dialog on the member it was given and records for them", async () => {
    const user = userEvent.setup();
    render(
      <ViolationRecordDialog
        open
        onOpenChange={vi.fn()}
        onRecorded={vi.fn()}
        initialMemberUserId="member-7"
      />,
    );

    expect(screen.getByRole("combobox", { name: "memberPlaceholder" })).toHaveAttribute(
      "data-value",
      "member-7",
    );
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mocks.createViolation).toHaveBeenCalledWith(
      expect.objectContaining({ member_user_id: "member-7" }),
      expect.any(Object),
    );
  });

  it("registers a user searched within the chosen role (students first)", async () => {
    const user = userEvent.setup();
    render(<MemberRegisterForm onDone={vi.fn()} />);

    const picker = screen.getByRole("combobox", { name: "userPlaceholder" });
    expect(picker).toHaveAttribute("data-kind", "student");
    await user.click(picker);
    expect(screen.getByRole("combobox", { name: "userPlaceholder" })).toHaveAttribute(
      "data-value",
      "picked-1",
    );
  });
});

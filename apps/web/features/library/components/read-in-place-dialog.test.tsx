import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import idMessages from "../../../messages/features/library.id.json";

import { ReadInPlaceDialog } from "./read-in-place-dialog";

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Makassar" }));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
const log = vi.hoisted(() => ({ entries: [] as Record<string, string>[] }));
const endMutate = vi.hoisted(() => vi.fn());
vi.mock("../visits-api", () => ({
  useLibraryReadInPlaceQuery: () => ({ data: { data: log.entries }, isLoading: false }),
  useStartLibraryReadInPlaceMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useEndLibraryReadInPlaceMutation: () => ({
    mutate: endMutate,
    isPending: false,
    variables: undefined,
  }),
}));

beforeEach(() => {
  log.entries = [];
  endMutate.mockReset();
});

describe("ReadInPlaceDialog", () => {
  it("marks both reader fields optional on their labels, not in a placeholder", () => {
    render(<ReadInPlaceDialog copyId="c1" onOpenChange={vi.fn()} />);

    // Field's own marker, the one every other form uses.
    expect(screen.getByText("member").closest("label")).toHaveTextContent("member (opsional)");
    expect(screen.getByText("visitorName").closest("label")).toHaveTextContent(
      "visitorName (opsional)",
    );
    expect(idMessages.readInPlace.memberPlaceholder).not.toMatch(/opsional/i);
  });

  // Side by side, one label wrapped to two lines and the other did not.
  it("stacks the two reader fields, each full width, with the button after them", () => {
    render(<ReadInPlaceDialog copyId="c1" onOpenChange={vi.fn()} />);

    const form = screen.getByRole("button", { name: "start" }).closest("form");
    expect(form).toHaveClass("flex-col");
    expect(form).not.toHaveClass("flex-wrap");
    expect(screen.getByRole("button", { name: "start" })).toHaveClass("self-end");
  });

  // Every session used to read "sedang berlangsung" forever with no reader:
  // nothing could end one, and member sessions showed only the empty
  // visitor name.
  it("names each reader and lets an open session be ended", async () => {
    log.entries = [
      {
        id: "r2",
        copy_id: "c1",
        member_user_id: "u2",
        member_name: "Siswa Dua Contoh",
        started_at: "2026-11-20T08:08:00Z",
      },
      {
        id: "r1",
        copy_id: "c1",
        visitor_name: "Tamu Sekolah",
        started_at: "2026-11-20T07:44:00Z",
        ended_at: "2026-11-20T08:08:00Z",
      },
    ];
    render(<ReadInPlaceDialog copyId="c1" onOpenChange={vi.fn()} />);

    const [open, ended] = within(screen.getByRole("list", { name: "logHeading" })).getAllByRole(
      "listitem",
    );
    if (!open || !ended) throw new Error("expected two log rows");
    expect(open).toHaveTextContent("Siswa Dua Contoh");
    expect(open).toHaveTextContent("ongoing");
    expect(ended).toHaveTextContent("Tamu Sekolah");
    expect(ended).toHaveTextContent("endedAt");
    expect(ended).not.toHaveTextContent("ongoing");
    expect(within(ended).queryByRole("button", { name: "end" })).not.toBeInTheDocument();

    await userEvent.click(within(open).getByRole("button", { name: "end" }));
    expect(endMutate).toHaveBeenCalledWith("r2", expect.anything());
  });

  it("falls back to an unnamed reader when a session has neither name", () => {
    log.entries = [{ id: "r3", copy_id: "c1", started_at: "2026-11-20T07:44:00Z" }];
    render(<ReadInPlaceDialog copyId="c1" onOpenChange={vi.fn()} />);

    expect(screen.getByText("unnamedReader")).toBeInTheDocument();
  });
});

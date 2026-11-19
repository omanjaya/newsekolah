import { ApiError } from "@newsekolah/api-client";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => `error.${code}`,
}));

const refetch = vi.fn();
const previewMock = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({
  useEraporPreviewQuery: previewMock,
  useTermsQuery: () => ({ data: { data: [] }, isLoading: false }),
  downloadEraporExport: vi.fn(),
  downloadEraporExportLegacy: vi.fn(),
}));

import { EraporExport, type EraporExportProps } from "./erapor-export";

const taughtClasses = [{ id: "class-1", name: "X-A" }];

function renderExport(overrides: Partial<EraporExportProps> = {}) {
  const props: EraporExportProps = {
    classes: taughtClasses,
    subjectsOf: () => [],
    canPublishIn: () => true,
    onOpenGradebook: vi.fn(),
    ...overrides,
  };
  return render(<EraporExport {...props} />);
}

function failWith(code: string, status = 403) {
  previewMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    isRefetching: false,
    error: new ApiError({ status, code, message: code }),
    refetch,
  });
}

beforeAll(() => {
  // Radix Select probes pointer capture and scrolls the active option into view.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
  cleanup();
  previewMock.mockReset();
  refetch.mockReset();
});

describe("EraporExport preview states", () => {
  it("explains unpublished grades as an empty state, not a red error, and sends a teacher to publish", async () => {
    failWith("GRADES_NOT_PUBLISHED");
    const onOpenGradebook = vi.fn();
    const user = userEvent.setup();
    renderExport({ onOpenGradebook });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("notPublishedTitle")).toBeInTheDocument();
    expect(screen.getByText("notPublishedBodyManage")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "openGradebook" }));
    expect(onOpenGradebook).toHaveBeenCalledExactlyOnceWith("class-1");
  });

  it("asks about the exported class, so a manage_grades holder who teaches nothing there only reads", () => {
    failWith("GRADES_NOT_PUBLISHED");
    const canPublishIn = vi.fn(() => false);
    renderExport({ canPublishIn });

    expect(canPublishIn).toHaveBeenCalledWith("class-1");
    expect(screen.getByText("notPublishedBodyRead")).toBeInTheDocument();
    expect(screen.queryByText("notPublishedBodyManage")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "openGradebook" })).not.toBeInTheDocument();
  });

  it("tells a reader who cannot publish that the teachers have not published, with no action", () => {
    failWith("GRADES_NOT_PUBLISHED");
    renderExport({ canPublishIn: () => false });

    expect(screen.getByText("notPublishedBodyRead")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "openGradebook" })).not.toBeInTheDocument();
  });

  it("explains a class without subjects as an empty state too", () => {
    failWith("NO_GRADABLE_SUBJECTS");
    renderExport();

    expect(screen.getByText("noSubjectsTitle")).toBeInTheDocument();
    expect(screen.queryByText("previewError")).not.toBeInTheDocument();
  });

  it("keeps a real failure as an error with a retry", async () => {
    failWith("INTERNAL_ERROR", 500);
    const user = userEvent.setup();
    renderExport();

    expect(screen.getByText("error.INTERNAL_ERROR")).toBeInTheDocument();
    expect(screen.getByText("previewError")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("offers no retry for a refusal a retry cannot change", () => {
    failWith("NOT_TEACHING_THIS_CLASS");
    renderExport({ canPublishIn: () => false });

    expect(screen.getByText("error.NOT_TEACHING_THIS_CLASS")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "retry" })).not.toBeInTheDocument();
  });

  it("lets the file format picker fill the column on a phone like its siblings", () => {
    previewMock.mockReturnValue({
      data: { rows: [], skipped: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch,
    });
    renderExport();

    // Field renders the label in the same wrapper it gives the className.
    const formatField = screen.getByText("formatLabel").closest(".w-full");
    expect(formatField).toHaveClass("md:w-auto");
  });
});

describe("EraporExport class scope", () => {
  function emptyPreview() {
    previewMock.mockReturnValue({
      data: { rows: [], skipped: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch,
    });
  }

  it("offers only the classes the page passes and starts on the page's sheet class", async () => {
    emptyPreview();
    const user = userEvent.setup();
    renderExport({
      classes: [
        { id: "class-1", name: "X-A" },
        { id: "class-2", name: "XI-B" },
      ],
      defaultClassId: "class-2",
    });

    expect(previewMock).toHaveBeenLastCalledWith("class-2", undefined);
    await user.click(screen.getByRole("combobox", { name: "pickClass" }));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual([
      "X-A",
      "XI-B",
    ]);
  });

  it("falls back to the first offered class when the default is not one of them", () => {
    emptyPreview();
    renderExport({ defaultClassId: "class-9" });

    expect(previewMock).toHaveBeenLastCalledWith("class-1", undefined);
  });

  it("shows a calm empty state, never a red error, when there is no class to export", () => {
    emptyPreview();
    renderExport({ classes: [] });

    expect(screen.getByText("noClassesTitle")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("previewError")).not.toBeInTheDocument();
    expect(previewMock).toHaveBeenLastCalledWith("", undefined);
  });

  it("offers the per-subject file only for subjects of the exported class", async () => {
    emptyPreview();
    const subjectsOf = vi.fn(() => [{ id: "subject-1", name: "Matematika" }]);
    const user = userEvent.setup();
    renderExport({ subjectsOf });

    expect(subjectsOf).toHaveBeenCalledWith("class-1");
    await user.click(screen.getByRole("combobox", { name: "legacySubject" }));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual([
      "Matematika",
    ]);
  });
});

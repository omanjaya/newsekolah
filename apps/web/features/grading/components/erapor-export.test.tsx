import { ApiError } from "@newsekolah/api-client";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => `error.${code}`,
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "class-1", name: "X-A" }] }, isLoading: false }),
  useSubjectsQuery: () => ({ data: { data: [] }, isLoading: false }),
}));

const refetch = vi.fn();
const previewMock = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({
  useEraporPreviewQuery: previewMock,
  useTermsQuery: () => ({ data: { data: [] }, isLoading: false }),
  downloadEraporExport: vi.fn(),
  downloadEraporExportLegacy: vi.fn(),
}));

import { EraporExport } from "./erapor-export";

function failWith(code: string) {
  previewMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    isRefetching: false,
    error: new ApiError({ status: 403, code, message: code }),
    refetch,
  });
}

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
    render(<EraporExport canPublish onOpenGradebook={onOpenGradebook} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("notPublishedTitle")).toBeInTheDocument();
    expect(screen.getByText("notPublishedBodyManage")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "openGradebook" }));
    expect(onOpenGradebook).toHaveBeenCalledOnce();
  });

  it("tells a reader who cannot publish that the teachers have not published, with no action", () => {
    failWith("GRADES_NOT_PUBLISHED");
    render(<EraporExport canPublish={false} onOpenGradebook={vi.fn()} />);

    expect(screen.getByText("notPublishedBodyRead")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "openGradebook" })).not.toBeInTheDocument();
  });

  it("explains a class without subjects as an empty state too", () => {
    failWith("NO_GRADABLE_SUBJECTS");
    render(<EraporExport canPublish onOpenGradebook={vi.fn()} />);

    expect(screen.getByText("noSubjectsTitle")).toBeInTheDocument();
    expect(screen.queryByText("previewError")).not.toBeInTheDocument();
  });

  it("keeps a real failure as an error with a retry", async () => {
    failWith("INTERNAL_ERROR");
    const user = userEvent.setup();
    render(<EraporExport canPublish onOpenGradebook={vi.fn()} />);

    expect(screen.getByText("error.INTERNAL_ERROR")).toBeInTheDocument();
    expect(screen.getByText("previewError")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("lets the file format picker fill the column on a phone like its siblings", () => {
    previewMock.mockReturnValue({
      data: { rows: [], skipped: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch,
    });
    render(<EraporExport canPublish onOpenGradebook={vi.fn()} />);

    // Field renders the label in the same wrapper it gives the className.
    const formatField = screen.getByText("formatLabel").closest(".w-full");
    expect(formatField).toHaveClass("md:w-auto");
  });
});

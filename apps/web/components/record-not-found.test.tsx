import { ApiError } from "@newsekolah/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RecordForbiddenPage, RecordNotFoundPage } from "./record-not-found";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => `errors.${code}`,
}));
vi.mock("./app-page", () => import("../test/app-page-stub"));

describe("RecordNotFoundPage", () => {
  it("names what is missing and leads back to where it is listed, with no retry", () => {
    render(
      <RecordNotFoundPage
        title="Siswa tidak ditemukan"
        backHref="/school/classes"
        backLabel="Kembali ke daftar kelas"
      />,
    );

    expect(screen.getByRole("heading", { name: "Siswa tidak ditemukan" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kembali ke daftar kelas" })).toHaveAttribute(
      "href",
      "/school/classes",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("takes the screen's own explanation over the shared one", () => {
    render(
      <RecordNotFoundPage
        title="Anggota tidak ditemukan"
        description="Anggota ini mungkin sudah dihapus."
        backHref="/library/members"
        backLabel="Kembali"
      />,
    );

    expect(screen.getByText("Anggota ini mungkin sudah dihapus.")).toBeInTheDocument();
    expect(screen.queryByText("body")).not.toBeInTheDocument();
  });
});

describe("RecordForbiddenPage", () => {
  it("says why with the API's own reason and leads back, with no retry", () => {
    render(
      <RecordForbiddenPage
        error={new ApiError({ status: 403, code: "EXTRACURRICULAR_COACH_ONLY", message: "x" })}
        backHref="/activities/clubs"
        backLabel="Kembali ke ekstrakurikuler"
      />,
    );

    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByText("errors.EXTRACURRICULAR_COACH_ONLY")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kembali ke ekstrakurikuler" })).toHaveAttribute(
      "href",
      "/activities/clubs",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to the shared sentence for a bare FORBIDDEN", () => {
    render(
      <RecordForbiddenPage
        error={new ApiError({ status: 403, code: "FORBIDDEN", message: "x" })}
        backHref="/"
        backLabel="Kembali"
      />,
    );

    expect(screen.getByText("body")).toBeInTheDocument();
  });
});

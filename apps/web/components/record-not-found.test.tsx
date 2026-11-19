import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RecordNotFoundPage } from "./record-not-found";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
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

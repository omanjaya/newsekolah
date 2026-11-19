import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { setDocumentSchoolName } from "../../../lib/page-title";

import { AuthCard } from "./auth-card";

afterEach(() => {
  document.title = "";
});

// Every sign-in page used to be titled only the school's name, so a tab,
// a bookmark or a screen reader could not tell them apart.
describe("AuthCard", () => {
  it("names the tab after its title", () => {
    setDocumentSchoolName("SMA Contoh");
    render(<AuthCard title="Lupa kata sandi" />);
    expect(screen.getByRole("heading", { level: 1, name: "Lupa kata sandi" })).toBeInTheDocument();
    expect(document.title).toBe("Lupa kata sandi · SMA Contoh");
  });

  it("names the tab with documentTitle when the heading is not a page name", () => {
    setDocumentSchoolName("SMA Contoh");
    const view = render(<AuthCard title="Selamat datang kembali" documentTitle="Masuk" />);
    expect(document.title).toBe("Masuk · SMA Contoh");
    view.unmount();
    expect(document.title).toBe("SMA Contoh");
  });
});

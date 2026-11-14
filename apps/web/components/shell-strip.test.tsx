import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ShellStrip } from "./shell-strip";

describe("ShellStrip", () => {
  it("announces its title as a status, keeps the detail in the tooltip, and renders its action", () => {
    render(
      <ShellStrip
        icon={<svg />}
        title="Tidak ada koneksi"
        detail="Perubahan disimpan sementara di perangkat"
        action={<button type="button">Muat ulang</button>}
      />,
    );
    const strip = screen.getByRole("status");
    expect(strip).toHaveTextContent("Tidak ada koneksi");
    expect(screen.getByTitle("Perubahan disimpan sementara di perangkat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Muat ulang" })).toBeInTheDocument();
  });

  it("can be raised to an alert for a state that needs attention now", () => {
    render(<ShellStrip role="alert" icon={<svg />} title="Sesi uji berakhir" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Sesi uji berakhir");
  });
});

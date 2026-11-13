import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Input } from "./input.js";
import { PasswordInput } from "./password-input.js";
import { SearchInput } from "./search-input.js";
import { Textarea } from "./textarea.js";

describe("Input and Textarea", () => {
  it("accepts typing", async () => {
    render(<Input aria-label="Nama" />);
    await userEvent.type(screen.getByRole("textbox", { name: "Nama" }), "Siti");
    expect(screen.getByRole("textbox", { name: "Nama" })).toHaveValue("Siti");
  });

  it("outlines an empty field with the 3:1 control border, not the card hairline", () => {
    render(
      <>
        <Input aria-label="Nama" />
        <Textarea aria-label="Catatan" />
      </>,
    );
    for (const name of ["Nama", "Catatan"]) {
      const field = screen.getByRole("textbox", { name });
      expect(field).toHaveClass(
        "border-(--field-border)",
        "[--field-border:var(--color-border-strong)]",
      );
      expect(field).not.toHaveClass("border-border");
    }
  });

  it("marks an invalid field for assistive tech, which is what turns its border red", () => {
    render(<Input aria-label="Email" invalid />);
    const field = screen.getByRole("textbox", { name: "Email" });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveClass("aria-invalid:[--field-border:var(--color-danger)]");
    // No plain hover border that could outrank the invalid one (field-styles.test.ts
    // checks the compiled rule order).
    expect(field.className).not.toMatch(/(^|\s)hover:border-/);
  });

  it("keeps a caller's border color under the pointer", () => {
    render(<Input aria-label="Nilai" className="border-accent" />);
    const field = screen.getByRole("textbox", { name: "Nilai" });
    expect(field).toHaveClass("border-accent");
    expect(field).not.toHaveClass("border-(--field-border)");
  });

  it("is a 44px target wherever the pointer is coarse and compact with a cursor", () => {
    render(
      <>
        <Input aria-label="Biasa" />
        <Input aria-label="Kecil" size="sm" />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Biasa" })).toHaveClass(
      "h-11",
      "md:pointer-fine:h-9",
    );
    expect(screen.getByRole("textbox", { name: "Kecil" })).toHaveClass(
      "h-11",
      "md:pointer-fine:h-8",
    );
  });

  it("draws adornments inside one box and focuses the input from a press on them", async () => {
    render(<Input aria-label="Berat" leading="Rp" trailing="kg" className="w-48" />);
    const input = screen.getByRole("textbox", { name: "Berat" });
    const box = input.parentElement;
    expect(box).toHaveClass("w-48", "[--field-border:var(--color-border-strong)]");
    expect(input).toHaveClass("outline-none");
    await userEvent.click(screen.getByText("kg"));
    expect(input).toHaveFocus();
  });

  it("grows an autosizing textarea with its content and drops the resize handle", () => {
    render(<Textarea aria-label="Catatan" autoResize defaultValue={"a\nb\nc"} />);
    const textarea = screen.getByRole("textbox", { name: "Catatan" });
    expect(textarea).toHaveClass("resize-none");
    expect(textarea.style.height).not.toBe("");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <div>
        <Input aria-label="Nama" />
        <Input aria-label="Nominal" leading="Rp" invalid />
        <Textarea aria-label="Catatan" autoResize />
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});

describe("PasswordInput", () => {
  it("shows and hides the password with a pressed toggle", async () => {
    render(<PasswordInput aria-label="Kata sandi" defaultValue="rahasia" />);
    const input = screen.getByLabelText("Kata sandi");
    expect(input).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: "Tampilkan kata sandi" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Sembunyikan kata sandi" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("warns while Caps Lock is on", async () => {
    render(<PasswordInput aria-label="Kata sandi" />);
    await userEvent.click(screen.getByLabelText("Kata sandi"));
    await userEvent.keyboard("{CapsLock}");
    expect(screen.getByRole("status")).toHaveTextContent("Caps Lock aktif");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<PasswordInput aria-label="Kata sandi" />);
    await expectNoAxeViolations(container);
  });
});

describe("SearchInput", () => {
  it("clears a controlled box through its own onChange, and with Escape", async () => {
    function Harness() {
      const [value, setValue] = useState("Nadia");
      return (
        <SearchInput
          aria-label="Cari"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      );
    }
    render(<Harness />);
    const box = screen.getByRole("searchbox", { name: "Cari" });
    await userEvent.click(screen.getByRole("button", { name: "Hapus pencarian" }));
    expect(box).toHaveValue("");
    expect(box).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Hapus pencarian" })).not.toBeInTheDocument();

    await userEvent.type(box, "Budi");
    await userEvent.keyboard("{Escape}");
    expect(box).toHaveValue("");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<SearchInput aria-label="Cari" defaultValue="X IPA" />);
    await expectNoAxeViolations(container);
  });
});

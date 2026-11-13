import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Input } from "./input.js";
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
      expect(field).toHaveClass("border-border-strong");
      expect(field).not.toHaveClass("border-border");
    }
  });

  it("marks an invalid field for assistive tech and in its border", () => {
    render(<Input aria-label="Email" invalid />);
    const field = screen.getByRole("textbox", { name: "Email" });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveClass("border-danger");
  });
});

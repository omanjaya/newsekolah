import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormSection } from "./form-layout.js";

describe("FormSection", () => {
  it("insets a card section as far as a default Card, at every width", () => {
    render(
      <FormSection variant="card" title="Lama sesi">
        <p>Isi</p>
      </FormSection>,
    );
    const section = screen.getByRole("region", { name: "Lama sesi" });
    expect(section).toHaveClass("p-5", "rounded-lg", "bg-surface");
    expect(section).not.toHaveClass("md:p-6");
  });
});

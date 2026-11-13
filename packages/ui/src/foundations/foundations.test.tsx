import { composeStories } from "@storybook/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import * as stories from "./foundations.stories.js";

const { TypeRoles, SurfacesAndElevation, SemanticColors, Motion } = composeStories(stories);

describe("Foundations stories", () => {
  it("renders one sample per typography role, each with its role class", () => {
    render(<TypeRoles />);
    expect(screen.getByText("Selamat datang, Nadia")).toHaveClass("text-display");
    expect(screen.getByText("Diperbarui 2 jam lalu")).toHaveClass("text-caption");
    expect(screen.getAllByText(/^text-/)).toHaveLength(8);
  });

  it("renders the surfaces, elevation levels and control states", () => {
    render(<SurfacesAndElevation />);
    for (const level of ["shadow-0", "shadow-1", "shadow-2", "shadow-3"]) {
      expect(screen.getByText(level)).toBeInTheDocument();
    }
    expect(screen.getByRole("checkbox", { name: "Sebagian" })).toHaveAttribute(
      "aria-checked",
      "mixed",
    );
  });

  it("renders the semantic colors and state layers", () => {
    render(<SemanticColors />);
    expect(screen.getByText("Gagal disimpan")).toHaveClass("text-danger");
    expect(screen.getByText("state-selected")).toHaveClass("bg-state-selected");
  });

  it("renders the motion demos with a staggered enter", () => {
    render(<Motion />);
    const tiles = document.querySelectorAll(".animate-enter");
    expect(tiles).toHaveLength(4);
    expect((tiles[2] as HTMLElement).style.getPropertyValue("--stagger")).toBe("2");
  });
});

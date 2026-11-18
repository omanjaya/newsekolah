import { TextLink, UiLinkProvider, type UiLinkComponent } from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import Link from "next/link";
import { describe, expect, it } from "vitest";

// The contract is checked by `pnpm typecheck`: next/link's typings resolve
// their own copy of @types/react, so a `ref` member in UiLinkProps made
// this assignment fail (TS2322) and `<UiLinkProvider component={Link}>`
// could not be written. Keep it a plain assignment, no cast.
const nextLink: UiLinkComponent = Link;

describe("UiLinkProvider with next/link", () => {
  it("renders the shared components' links through next/link", () => {
    render(
      <UiLinkProvider component={nextLink}>
        <TextLink href="/students">Data siswa</TextLink>
      </UiLinkProvider>,
    );
    expect(screen.getByRole("link", { name: "Data siswa" })).toHaveAttribute("href", "/students");
  });
});

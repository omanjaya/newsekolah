import { render, screen } from "@testing-library/react";
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { TextLink } from "./text-link.js";
import { UiLabelsProvider } from "./ui-labels.js";
import { UiLinkProvider } from "./ui-link.js";

const ClientLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  function ClientLink(props, ref) {
    // eslint-disable-next-line jsx-a11y/anchor-has-content -- children arrive through the spread
    return <a ref={ref} data-client-link="" {...props} />;
  },
);

describe("TextLink", () => {
  it("renders a standalone accent link on the label role", async () => {
    const { container } = render(<TextLink href="/announcements">Lihat semua</TextLink>);
    const link = screen.getByRole("link", { name: "Lihat semua" });
    expect(link).toHaveAttribute("href", "/announcements");
    expect(link).toHaveClass("text-label", "text-accent", "hover:underline");
    await expectNoAxeViolations(container);
  });

  // An inset hit area grows from the link's own box, which is shorter than
  // its line for inline text; a fixed 44px box centred on the text is the
  // same height for an inline and an inline-flex (external) link.
  it("gives a touch screen a 44px target centred on the text", () => {
    render(
      <>
        <TextLink href="/a">Lihat semua</TextLink>
        <TextLink href="https://example.org" external>
          Panduan
        </TextLink>
      </>,
    );
    for (const name of ["Lihat semua", /Panduan/]) {
      expect(screen.getByRole("link", { name })).toHaveClass(
        "pointer-coarse:after:h-11",
        "pointer-coarse:after:top-1/2",
        "pointer-coarse:after:-translate-y-1/2",
      );
    }
  });

  it("navigates through the provided client link component", () => {
    render(
      <UiLinkProvider component={ClientLink}>
        <TextLink href="/school">Struktur sekolah</TextLink>
      </UiLinkProvider>,
    );
    expect(screen.getByRole("link", { name: "Struktur sekolah" })).toHaveAttribute(
      "data-client-link",
    );
  });

  it("is always underlined inside running text", () => {
    render(
      <p>
        Lihat{" "}
        <TextLink href="/faq" variant="inline" tone="muted">
          pertanyaan umum
        </TextLink>
      </p>,
    );
    expect(screen.getByRole("link")).toHaveClass("underline", "text-fg-muted");
  });

  it("opens an external link in a new tab and says so", () => {
    render(
      <UiLabelsProvider labels={{ linkOpensInNewTab: "(new tab)" }}>
        <TextLink href="https://example.org" external>
          Panduan
        </TextLink>
      </UiLabelsProvider>,
    );
    // jsdom's name computation drops the space a browser keeps before the note.
    const link = screen.getByRole("link", { name: /^Panduan\s?\(new tab\)$/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("styles its child with asChild", () => {
    render(
      <TextLink asChild>
        <button type="button">Muat lagi</button>
      </TextLink>,
    );
    expect(screen.getByRole("button", { name: "Muat lagi" })).toHaveClass("text-accent");
  });
});

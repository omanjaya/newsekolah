import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { StatePage, type StatePageKind } from "./state-page.js";
import { UiLabelsProvider } from "./ui-labels.js";

describe("StatePage", () => {
  it("stands in for the page: an h1, one sentence, the actions and a small code", async () => {
    const { container } = render(
      <UiLabelsProvider labels={{ statePageCode: (code) => `Code ${code}` }}>
        <StatePage
          kind="not-found"
          title="Halaman tidak ditemukan"
          description="Alamat yang dituju tidak ada."
          action={<a href="/dashboard">Kembali ke beranda</a>}
          code="404"
        />
      </UiLabelsProvider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Halaman tidak ditemukan" }),
    ).toBeInTheDocument();
    // Balanced lines, so the centred sentence never ends on a lone word.
    expect(screen.getByText("Alamat yang dituju tidak ada.")).toHaveClass("text-balance");
    expect(screen.getByRole("link", { name: "Kembali ke beranda" })).toBeInTheDocument();
    expect(screen.getByText("Code 404")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("colours only a failure as one", () => {
    const tones: Record<StatePageKind, string> = {
      "not-found": "bg-neutral-soft",
      error: "bg-danger-soft",
      forbidden: "bg-warning-soft",
      "module-unavailable": "bg-neutral-soft",
      offline: "bg-neutral-soft",
    };
    for (const [kind, tone] of Object.entries(tones) as [StatePageKind, string][]) {
      const { container, unmount } = render(<StatePage kind={kind} title={kind} />);
      expect(container.querySelector('[aria-hidden="true"]')).toHaveClass(tone);
      unmount();
    }
  });

  it("fills the viewport outside the app shell", () => {
    const { container } = render(<StatePage kind="offline" title="Offline" fullScreen />);
    expect(container.firstElementChild).toHaveClass("min-h-dvh");
  });
});

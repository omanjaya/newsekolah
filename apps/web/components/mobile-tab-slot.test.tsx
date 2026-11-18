import { render, screen } from "@testing-library/react";
import { ScanLine } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { CentreButton, CentreLink } from "./mobile-tab-slot";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The raised accent button already makes the centre the loudest thing in
// the bar; a heavier, darker label read as the selected tab on a page where
// no tab is current (a 404, a 403).
describe("the centre slot's label", () => {
  it("reads like an idle tab while the centre is not current", () => {
    render(
      <CentreLink href="/scan" current={false} icon={<ScanLine />} label="Pindai" name="Pindai" />,
    );
    const label = screen.getByText("Pindai");
    expect(label).toHaveClass("font-medium", "text-fg-muted");
    expect(label).not.toHaveClass("text-fg");
    expect(screen.getByRole("link", { name: "Pindai" })).not.toHaveClass("font-semibold");
  });

  it("takes the accent and the label weight once current", () => {
    render(<CentreLink href="/scan" current icon={<ScanLine />} label="Pindai" name="Pindai" />);
    expect(screen.getByText("Pindai")).toHaveClass("font-semibold", "text-accent");
  });

  it("stays idle as the quick-action sheet's trigger", () => {
    render(<CentreButton icon={<ScanLine />} label="Aksi cepat" name="Aksi cepat" />);
    expect(screen.getByText("Aksi cepat")).toHaveClass("font-medium", "text-fg-muted");
  });
});

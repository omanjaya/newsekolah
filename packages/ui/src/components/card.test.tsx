import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card.js";

describe("Card", () => {
  it("keeps the unpadded default, with sections carrying the 20px inset", async () => {
    const { container } = render(
      <Card data-testid="card">
        <CardHeader data-testid="header">
          <CardTitle>Pengumuman</CardTitle>
          <CardDescription>Diperbarui 2 jam lalu</CardDescription>
        </CardHeader>
        <CardContent data-testid="content">Isi</CardContent>
        <CardFooter data-testid="footer">Aksi</CardFooter>
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card).toHaveClass("rounded-lg", "border-border", "bg-surface", "shadow-1");
    expect(card).not.toHaveClass("p-5");
    expect(screen.getByTestId("header")).toHaveClass("p-5");
    expect(screen.getByTestId("content")).toHaveClass("p-5", "pt-0");
    // Set apart by space, not a rule: the content's 20px inset and 4px more.
    expect(screen.getByTestId("footer")).toHaveClass("p-5", "pt-1");
    expect(screen.getByTestId("footer")).not.toHaveClass("border-t");
    expect(screen.getByRole("heading", { level: 3, name: "Pengumuman" })).toHaveClass(
      "text-heading",
    );
    await expectNoAxeViolations(container);
  });

  it("moves the inset onto a padded card and drops it from the sections", () => {
    render(
      <Card padding="sm" data-testid="card">
        <CardHeader data-testid="header">
          <CardTitle>Judul</CardTitle>
        </CardHeader>
        <CardContent data-testid="content">Isi</CardContent>
        <CardFooter data-testid="footer">Aksi</CardFooter>
      </Card>,
    );
    expect(screen.getByTestId("card")).toHaveClass("p-4", "gap-3", "flex-col");
    expect(screen.getByTestId("header")).not.toHaveClass("p-5");
    expect(screen.getByTestId("content")).not.toHaveClass("p-5");
    expect(screen.getByTestId("footer")).toHaveClass("pt-1");
    expect(screen.getByTestId("footer")).not.toHaveClass("p-5");
    expect(screen.getByTestId("footer")).not.toHaveClass("border-t");
  });

  it("puts the header action beside the title and lets the title pick its level", () => {
    render(
      <Card>
        <CardHeader action={<a href="/all">Lihat semua</a>}>
          <CardTitle as="h2">Hari ini</CardTitle>
        </CardHeader>
      </Card>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Hari ini" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lihat semua" })).toBeInTheDocument();
  });

  it("renders an interactive card onto its link child with press feedback", async () => {
    const { container } = render(
      <Card interactive asChild padding="md">
        <a href="/attendance">
          <CardTitle as="p">Presensi</CardTitle>
        </a>
      </Card>,
    );
    const link = screen.getByRole("link", { name: "Presensi" });
    expect(link).toHaveClass("rounded-lg", "motion-press", "cursor-pointer", "hover:shadow-2");
    expect(link).toHaveAttribute("data-slot", "card");
    await expectNoAxeViolations(container);
  });

  it("refuses an interactive card that is not rendered onto a link or button", () => {
    render(
      <>
        {/* @ts-expect-error: a clickable div is out of reach of the keyboard. */}
        <Card interactive onClick={() => undefined}>
          Presensi
        </Card>
        <Card interactive asChild>
          <button type="button">Jurnal</button>
        </Card>
      </>,
    );
    expect(screen.getByRole("button", { name: "Jurnal" })).toHaveClass("cursor-pointer");
  });

  it("tints the text of an accent-soft card", () => {
    render(
      <Card tone="accent-soft" padding="md" data-testid="card">
        <CardTitle>Sekarang</CardTitle>
        <CardDescription>Matematika</CardDescription>
      </Card>,
    );
    expect(screen.getByTestId("card")).toHaveClass("bg-accent-soft", "text-accent-soft-fg");
    expect(screen.getByText("Sekarang")).not.toHaveClass("text-fg");
    expect(screen.getByText("Matematika")).toHaveClass("text-accent-soft-fg/80");
  });
});

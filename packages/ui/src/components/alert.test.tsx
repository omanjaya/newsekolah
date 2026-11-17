import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Alert } from "./alert.js";
import { UiLabelsProvider } from "./ui-labels.js";

describe("Alert", () => {
  it("is a polite status with a soft info tint by default", async () => {
    const { container } = render(
      <Alert title="Tahun ajaran belum aktif">Beberapa laporan akan kosong.</Alert>,
    );
    const alert = screen.getByRole("status");
    expect(alert).toHaveClass("bg-info-soft", "text-info-soft-fg", "rounded-md");
    expect(screen.getByText("Tahun ajaran belum aktif")).toHaveClass("text-body", "font-semibold");
    expect(screen.getByText("Beberapa laporan akan kosong.")).toHaveClass("text-body-sm");
    await expectNoAxeViolations(container);
  });

  it("announces a danger alert at once and offers its action", async () => {
    const { container } = render(
      <Alert
        variant="danger"
        title="Data gagal dimuat"
        action={<button type="button">Coba lagi</button>}
      />,
    );
    expect(screen.getByRole("alert")).toHaveClass("bg-danger-soft");
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("keeps the warning and success tones as statuses", () => {
    render(
      <>
        <Alert variant="warning" title="Sesi ditutup sebentar lagi" />
        <Alert variant="success" title="Dokumen asli" />
      </>,
    );
    const statuses = screen.getAllByRole("status");
    expect(statuses[0]).toHaveClass("bg-warning-soft");
    expect(statuses[1]).toHaveClass("bg-success-soft");
  });

  it("dismisses through a close button named from UiLabels", async () => {
    const onDismiss = vi.fn();
    render(
      <UiLabelsProvider labels={{ alertDismiss: "Dismiss" }}>
        <Alert title="Catatan" onDismiss={onDismiss} />
      </UiLabelsProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  // The action and the close button line up with each other and with the
  // icon in every alert, on the first line of text, rather than the action
  // centring on a two-line block while the close button sits on the title.
  it("puts the action and the close button on the title line, as one group", () => {
    render(
      <Alert
        tone="danger"
        title="Data gagal dimuat"
        action={<button type="button">Coba lagi</button>}
        onDismiss={() => undefined}
        dismissLabel="Tutup"
      >
        Periksa koneksi lalu coba lagi.
      </Alert>,
    );
    const action = screen.getByRole("button", { name: "Coba lagi" }).parentElement;
    const dismiss = screen.getByRole("button", { name: "Tutup" }).parentElement;
    // One line tall (the title's 20px), the control centred on it.
    expect(action).toHaveClass("sm:h-5", "items-center");
    expect(dismiss).toHaveClass("h-5", "items-center", "sm:-ml-2");
    expect(action?.parentElement?.className).not.toMatch(/items-center/);
  });

  it("takes two actions, the main one first, in the one action slot", () => {
    render(
      <Alert
        tone="warning"
        title="Draf ditemukan"
        action={
          <>
            <button type="button">Pulihkan</button>
            <button type="button">Buang</button>
          </>
        }
      >
        Ada catatan yang belum terkirim dari pukul 08.40.
      </Alert>,
    );
    const restore = screen.getByRole("button", { name: "Pulihkan" });
    const discard = screen.getByRole("button", { name: "Buang" });
    const slot = restore.parentElement;
    expect(slot).toHaveAttribute("data-slot", "alert-action");
    expect(discard.parentElement).toBe(slot);
    expect(slot?.firstElementChild).toBe(restore);
    // Under the text on a phone they may wrap; on the title line they do not.
    expect(slot).toHaveClass("flex-wrap", "sm:flex-nowrap", "gap-2");
  });

  // A flex column would make every text run and inline element its own
  // stacked item, putting the link on a line of its own.
  it("keeps a sentence with an inline link in normal flow", () => {
    render(
      <Alert variant="warning" title="Judul sudah ada">
        Judul &quot;Laskar Pelangi&quot; sudah ada di katalog. <a href="#title">Lihat</a>
      </Alert>,
    );
    const description = screen.getByRole("link", { name: "Lihat" }).parentElement;
    expect(description).toHaveClass("text-body-sm");
    expect(description?.className).not.toMatch(/\b(flex|grid|flex-col)\b/);
    expect(description).toHaveTextContent('Judul "Laskar Pelangi" sudah ada di katalog. Lihat');
  });

  it("takes `tone` as the name of its colour, `variant` still honoured", () => {
    render(
      <>
        <Alert tone="success" title="Tersimpan" />
        <Alert variant="warning" tone="danger" title="Gagal" />
      </>,
    );
    expect(screen.getByRole("status")).toHaveClass("bg-success-soft");
    expect(screen.getByRole("alert")).toHaveClass("bg-danger-soft");
  });

  it("forwards a ref to its root", () => {
    const ref = createRef<HTMLDivElement>();
    render(<Alert ref={ref} title="Catatan" />);
    expect(ref.current).toBe(screen.getByRole("status"));
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
});

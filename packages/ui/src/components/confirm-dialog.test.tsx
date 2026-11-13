import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Button } from "./button.js";
import { ConfirmDialog } from "./confirm-dialog.js";
import { UiLabelsProvider } from "./ui-labels.js";

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Hapus
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Hapus akun siswa"
        description="Data akan hilang secara permanen."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        destructive
        onConfirm={() => {
          onConfirm();
          setOpen(false);
        }}
      />
    </>
  );
}

describe("ConfirmDialog", () => {
  it("does not call onConfirm just by opening", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Hapus" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm and closes when the destructive action is confirmed", async () => {
    // Radix sets `pointer-events: none` on <body> while the dialog is open;
    // jsdom does not resolve the dialog content's own `pointer-events: auto`
    // override, so user-event's real-interaction check must be disabled here.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Hapus" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    // Radix hides the rest of the page (including the trigger) from the
    // accessibility tree while the dialog is open, so this now uniquely
    // resolves to the confirm button inside the dialog.
    await user.click(screen.getByRole("button", { name: "Hapus" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes without confirming when cancelled", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Hapus" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("takes its button labels from UiLabels when the caller gives none", () => {
    render(
      <UiLabelsProvider
        labels={{ confirmDialogConfirm: "Continue", confirmDialogCancel: "Cancel" }}
      >
        <ConfirmDialog open onOpenChange={vi.fn()} title="Publish?" onConfirm={vi.fn()} />
      </UiLabelsProvider>,
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("draws the danger tone: a danger confirm button and a warning icon", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Hapus?"
        confirmLabel="Hapus"
        tone="danger"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Hapus" })).toHaveClass("bg-danger");
    expect(screen.getByRole("dialog").querySelector(".bg-danger-soft")).toBeInTheDocument();
  });

  it("cannot be dismissed while the action is running", async () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Hapus?"
        confirmLabel="Hapus"
        tone="danger"
        confirming
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Hapus" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Batal" })).toBeDisabled();
    // The header's X would do nothing either, so it does not look clickable.
    expect(screen.getByRole("button", { name: "Tutup dialog" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("keeps the close button active while nothing runs", () => {
    render(<ConfirmDialog open onOpenChange={vi.fn()} title="Hapus?" onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Tutup dialog" })).toBeEnabled();
  });

  it("has no accessibility violations", async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Hapus akun siswa?"
        description="Nadia Putri akan dihapus permanen."
        tone="danger"
        onConfirm={vi.fn()}
      />,
    );
    await expectNoAxeViolations(screen.getByRole("dialog"));
  });
});

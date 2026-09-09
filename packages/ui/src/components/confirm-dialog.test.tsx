import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button.js";
import { ConfirmDialog } from "./confirm-dialog.js";

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
});

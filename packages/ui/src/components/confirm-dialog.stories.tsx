import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { Button } from "./button.js";
import { ConfirmDialog } from "./confirm-dialog.js";

function ConfirmDialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="danger"
        onClick={() => {
          setOpen(true);
        }}
      >
        Hapus akun siswa
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Hapus akun siswa"
        description="Data presensi dan nilai siswa ini akan ikut terhapus dan tidak dapat dipulihkan."
        confirmLabel="Hapus"
        destructive
        onConfirm={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

const meta: Meta<typeof ConfirmDialogDemo> = {
  title: "Components/ConfirmDialog",
  component: ConfirmDialogDemo,
};
export default meta;
type Story = StoryObj<typeof ConfirmDialogDemo>;

export const Default: Story = {};

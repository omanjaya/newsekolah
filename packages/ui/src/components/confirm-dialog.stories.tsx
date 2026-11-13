import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { Button } from "./button.js";
import { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog.js";

/** Open at a 390px viewport to see the bottom sheet with full-width buttons. */
const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full">
    <Story />
  </div>
);

function ConfirmDemo(props: Partial<ConfirmDialogProps>) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button
        variant="danger"
        onClick={() => {
          setOpen(true);
        }}
      >
        Hapus siswa
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Hapus akun siswa?"
        description="Nadia Putri dan seluruh riwayat presensinya akan dihapus permanen."
        confirmLabel="Hapus"
        onConfirm={() => {
          setOpen(false);
        }}
        {...props}
      />
    </>
  );
}

const meta: Meta = {
  title: "Components/ConfirmDialog",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

export const Danger: Story = { render: () => <ConfirmDemo tone="danger" /> };
export const Default: Story = {
  render: () => (
    <ConfirmDemo
      title="Terbitkan rapor?"
      description="Wali kelas dan orang tua bisa melihat rapor semester ganjil setelah diterbitkan."
      confirmLabel="Terbitkan"
    />
  ),
};
export const Confirming: Story = { render: () => <ConfirmDemo tone="danger" confirming /> };
export const Dark: Story = {
  globals: { theme: "dark" },
  render: () => <ConfirmDemo tone="danger" />,
};
export const Phone: Story = {
  decorators: [phoneFrame],
  render: () => <ConfirmDemo tone="danger" />,
};

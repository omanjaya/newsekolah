import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button.js";
import { Toaster, useToast } from "./toast.js";

function ToastDemo() {
  const toast = useToast();
  return (
    <>
      <Toaster />
      <div className="flex gap-2">
        <Button
          onClick={() => {
            toast.success("Presensi tersimpan");
          }}
        >
          Sukses
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            toast.error("Gagal menyimpan presensi", {
              retry: { label: "Coba lagi", onClick: () => undefined },
            });
          }}
        >
          Gagal
        </Button>
      </div>
    </>
  );
}

const meta: Meta<typeof ToastDemo> = {
  title: "Components/Toast",
  component: ToastDemo,
};
export default meta;
type Story = StoryObj<typeof ToastDemo>;

export const Default: Story = {};

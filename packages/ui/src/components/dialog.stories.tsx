import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button.js";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "./dialog.js";

function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Buka dialog</Button>
      </DialogTrigger>
      <DialogContent
        title="Terbitkan izin keluar"
        description="Izin berlaku selama jam yang dipilih."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Batal
              </Button>
            </DialogClose>
            <Button size="sm">Terbitkan</Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-muted">Konten dialog di sini.</p>
      </DialogContent>
    </Dialog>
  );
}

const meta: Meta<typeof DialogDemo> = {
  title: "Components/Dialog",
  component: DialogDemo,
};
export default meta;
type Story = StoryObj<typeof DialogDemo>;

export const Default: Story = {};

import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button.js";
import { Sheet, SheetContent, SheetTrigger } from "./sheet.js";

function SheetDemo() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Lainnya</Button>
      </SheetTrigger>
      <SheetContent title="Aksi lainnya" description="Pilih salah satu aksi di bawah.">
        <div className="flex flex-col gap-2">
          <Button variant="secondary">Cetak kartu</Button>
          <Button variant="secondary">Kirim ke orang tua</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const meta: Meta<typeof SheetDemo> = {
  title: "Components/Sheet",
  component: SheetDemo,
};
export default meta;
type Story = StoryObj<typeof SheetDemo>;

export const Default: Story = {};

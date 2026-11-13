import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { Filter } from "lucide-react";

import { Button } from "./button.js";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "./popover.js";
import { Switch } from "./switch.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

function PopoverDemo() {
  return (
    <div className="flex min-h-[22rem] p-4">
      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <Button variant="secondary" icon={<Filter />}>
            Filter
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-heading text-fg">Tampilkan</span>
            <span className="text-body-sm text-fg-muted">Berlaku untuk daftar izin hari ini.</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="only-pending" className="text-body text-fg">
              Hanya yang menunggu
            </label>
            <Switch id="only-pending" defaultChecked />
          </div>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="with-cancelled" className="text-body text-fg">
              Sertakan izin dibatalkan
            </label>
            <Switch id="with-cancelled" />
          </div>
          <div className="flex justify-end gap-2">
            <PopoverClose asChild>
              <Button variant="ghost" size="sm">
                Atur ulang
              </Button>
            </PopoverClose>
            <PopoverClose asChild>
              <Button size="sm">Terapkan</Button>
            </PopoverClose>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const meta: Meta = {
  title: "Components/Popover",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <PopoverDemo /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <PopoverDemo /> };
export const Phone: Story = { decorators: [phoneFrame], render: () => <PopoverDemo /> };

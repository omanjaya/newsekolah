import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button.js";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.js";

function PopoverDemo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary">Filter</Button>
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-[13px] text-fg-muted">Filter tanggal dan status di sini.</p>
      </PopoverContent>
    </Popover>
  );
}

const meta: Meta<typeof PopoverDemo> = {
  title: "Components/Popover",
  component: PopoverDemo,
};
export default meta;
type Story = StoryObj<typeof PopoverDemo>;

export const Default: Story = {};

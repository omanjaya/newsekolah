import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button.js";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip.js";

function TooltipDemo() {
  return (
    <TooltipProvider>
      <div className="flex gap-16 p-16">
        <Tooltip defaultOpen>
          <TooltipTrigger asChild>
            <Button variant="secondary">Terlambat</Button>
          </TooltipTrigger>
          <TooltipContent>Masuk 07.21, 6 menit setelah bel</TooltipContent>
        </Tooltip>
        <Tooltip defaultOpen>
          <TooltipTrigger asChild>
            <Button variant="secondary">2 jam lalu</Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Jumat, 14 November 2026 09.14</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

const meta: Meta = {
  title: "Components/Tooltip",
};
export default meta;
type Story = StoryObj;

/** Icon buttons bring their own tooltip from `aria-label`; see IconButton. */
export const Default: Story = { render: () => <TooltipDemo /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <TooltipDemo /> };

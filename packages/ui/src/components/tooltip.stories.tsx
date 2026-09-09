import type { Meta, StoryObj } from "@storybook/react";

import { domainIcons } from "../icons.js";

import { IconButton } from "./icon-button.js";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip.js";

const ScanIcon = domainIcons.scan;

function TooltipDemo() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton icon={<ScanIcon />} aria-label="Pindai" />
        </TooltipTrigger>
        <TooltipContent>Pindai QR</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const meta: Meta<typeof TooltipDemo> = {
  title: "Components/Tooltip",
  component: TooltipDemo,
};
export default meta;
type Story = StoryObj<typeof TooltipDemo>;

export const Default: Story = {};

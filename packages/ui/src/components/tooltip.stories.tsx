import type { Decorator, Meta, StoryObj } from "@storybook/react";

import { Button } from "./button.js";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full">
    <Story />
  </div>
);

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
/**
 * At 390px a long tooltip wraps at its 256px cap and stays 8px clear of the
 * screen edge (collision padding) instead of running off it.
 */
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => (
    <TooltipProvider>
      <div className="flex justify-end px-2 pt-20">
        <Tooltip defaultOpen>
          <TooltipTrigger asChild>
            <Button variant="secondary" size="sm">
              Terlambat
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            Masuk 07.21, 6 menit setelah bel. Tercatat oleh guru piket dari gerbang depan.
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  ),
};

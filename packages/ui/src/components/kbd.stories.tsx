import type { Meta, StoryObj } from "@storybook/react";
import { ArrowDown, ArrowUp, CornerDownLeft } from "lucide-react";

import { Kbd } from "./kbd.js";

function Keys() {
  return (
    <div className="flex flex-col gap-4 text-body-sm text-fg-muted">
      <span className="flex items-center gap-1">
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
        <span className="ml-2">Buka pencarian</span>
      </span>
      <span className="flex items-center gap-1">
        <Kbd>
          <ArrowUp />
        </Kbd>
        <Kbd>
          <ArrowDown />
        </Kbd>
        <span className="ml-2">Pindah</span>
        <Kbd className="ml-4">
          <CornerDownLeft />
        </Kbd>
        <span className="ml-2">Buka</span>
        <Kbd className="ml-4">Esc</Kbd>
        <span className="ml-2">Tutup</span>
      </span>
    </div>
  );
}

const meta: Meta<typeof Kbd> = {
  title: "Components/Kbd",
  component: Kbd,
};
export default meta;
type Story = StoryObj<typeof Kbd>;

export const Single: Story = { args: { children: "K" } };
export const Keyboard: Story = { render: () => <Keys /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Keys /> };

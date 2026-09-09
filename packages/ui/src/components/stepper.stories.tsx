import type { Meta, StoryObj } from "@storybook/react";

import { Stepper } from "./stepper.js";

const meta: Meta<typeof Stepper> = {
  title: "Components/Stepper",
  component: Stepper,
};
export default meta;
type Story = StoryObj<typeof Stepper>;

const steps = [
  { id: "request", label: "Diajukan" },
  { id: "homeroom", label: "Disetujui wali kelas" },
  { id: "gate", label: "Pindai di gerbang" },
];

export const Horizontal: Story = { args: { steps, currentIndex: 1 } };
export const Vertical: Story = { args: { steps, currentIndex: 1, orientation: "vertical" } };

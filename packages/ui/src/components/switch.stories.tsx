import type { Meta, StoryObj } from "@storybook/react";

import { Switch } from "./switch.js";

const meta: Meta<typeof Switch> = {
  title: "Components/Switch",
  component: Switch,
};
export default meta;
type Story = StoryObj<typeof Switch>;

export const Off: Story = { args: { "aria-label": "Notifikasi harian" } };
export const On: Story = { args: { "aria-label": "Notifikasi harian", defaultChecked: true } };
export const Disabled: Story = { args: { "aria-label": "Notifikasi harian", disabled: true } };

import type { Decorator, Meta, StoryObj } from "@storybook/react";

import { Switch } from "./switch.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

const ROWS = [
  { label: "Aplikasi", checked: true, disabled: true },
  { label: "Email", checked: false },
  { label: "WhatsApp", checked: true },
  { label: "Ringkasan harian", checked: false, disabled: true },
];

function Settings() {
  return (
    <div className="flex w-80 max-w-full flex-col divide-y divide-line rounded-lg border border-border bg-surface">
      {ROWS.map((row) => (
        <label
          key={row.label}
          className="flex items-center justify-between gap-4 px-5 py-3.5 text-body text-fg"
        >
          {row.label}
          <Switch defaultChecked={row.checked} disabled={row.disabled} />
        </label>
      ))}
    </div>
  );
}

const meta: Meta<typeof Switch> = {
  title: "Components/Switch",
  component: Switch,
  args: { "aria-label": "Notifikasi WhatsApp" },
};
export default meta;
type Story = StoryObj<typeof Switch>;

export const InSettings: Story = { render: () => <Settings /> };
export const Off: Story = {};
export const On: Story = { args: { defaultChecked: true } };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Settings /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Settings />,
};

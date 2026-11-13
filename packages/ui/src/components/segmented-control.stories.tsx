import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { Camera, Keyboard, Monitor, Moon, QrCode, Sun } from "lucide-react";
import { useState } from "react";

import { SegmentedControl } from "./segmented-control.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

function Demo() {
  const [status, setStatus] = useState("pending");
  const [mode, setMode] = useState("qr");
  const [theme, setTheme] = useState("system");
  return (
    <div className="flex max-w-full flex-col gap-6">
      <SegmentedControl
        aria-label="Status izin"
        value={status}
        onValueChange={setStatus}
        options={[
          { value: "all", label: "Semua", count: 128 },
          { value: "pending", label: "Menunggu", count: 3 },
          { value: "approved", label: "Disetujui", count: 117 },
          { value: "rejected", label: "Ditolak", count: 8 },
        ]}
      />
      <SegmentedControl
        aria-label="Mode piket"
        size="sm"
        value={mode}
        onValueChange={setMode}
        options={[
          { value: "qr", label: "Tampilkan QR", icon: <QrCode /> },
          { value: "camera", label: "Kamera", icon: <Camera /> },
          { value: "manual", label: "Manual", icon: <Keyboard /> },
        ]}
      />
      <div className="w-80 max-w-full">
        <SegmentedControl
          aria-label="Tema"
          fullWidth
          value={theme}
          onValueChange={setTheme}
          options={[
            { value: "system", label: "Sistem", icon: <Monitor /> },
            { value: "light", label: "Terang", icon: <Sun /> },
            { value: "dark", label: "Gelap", icon: <Moon /> },
          ]}
        />
      </div>
      <SegmentedControl
        aria-label="Rentang"
        size="sm"
        defaultValue="week"
        options={[
          { value: "day", label: "Hari" },
          { value: "week", label: "Minggu" },
          { value: "month", label: "Bulan" },
          { value: "semester", label: "Semester", disabled: true },
        ]}
      />
    </div>
  );
}

const meta: Meta<typeof SegmentedControl> = {
  title: "Components/SegmentedControl",
  component: SegmentedControl,
};
export default meta;
type Story = StoryObj<typeof SegmentedControl>;

export const Default: Story = { render: () => <Demo /> };
export const Disabled: Story = {
  render: () => (
    <SegmentedControl
      aria-label="Mode"
      disabled
      defaultValue="a"
      options={[
        { value: "a", label: "Harian" },
        { value: "b", label: "Mingguan" },
      ]}
    />
  ),
};
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Demo /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Demo />,
};

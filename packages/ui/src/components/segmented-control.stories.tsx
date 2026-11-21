import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { Camera, Dot, Keyboard, Monitor, Moon, QrCode, Sun } from "lucide-react";
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
      <WeekStrip />
    </div>
  );
}

/** Seven short day names on a phone's width: the dense size, today marked with a dot. */
function WeekStrip() {
  const [day, setDay] = useState("3");
  return (
    <div className="w-[358px] max-w-full">
      <SegmentedControl
        aria-label="Pilih hari"
        size="dense"
        fullWidth
        value={day}
        onValueChange={setDay}
        options={["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((label, index) => ({
          value: String(index + 1),
          label,
          icon: index === 2 ? <Dot className="-mx-1.5 text-accent" /> : undefined,
        }))}
      />
    </div>
  );
}

/**
 * A strip alone on its row: full width on a phone, its own width from
 * 640px. Beside a search it goes in a FilterBar (see its stories) instead.
 */
function ToolbarFilter() {
  const [value, setValue] = useState("all");
  return (
    <SegmentedControl
      aria-label="Tampilkan"
      fullWidth="phone"
      value={value}
      onValueChange={setValue}
      options={[
        { value: "all", label: "Semua" },
        { value: "onSite", label: "Di lokasi", count: 4 },
        { value: "expected", label: "Dijadwalkan", count: 2 },
      ]}
    />
  );
}

const meta: Meta<typeof SegmentedControl> = {
  title: "Components/SegmentedControl",
  component: SegmentedControl,
};
export default meta;
type Story = StoryObj<typeof SegmentedControl>;

export const Default: Story = { render: () => <Demo /> };
export const PhoneFullWidth: Story = { render: () => <ToolbarFilter /> };
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

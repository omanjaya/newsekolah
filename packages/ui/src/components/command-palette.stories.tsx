import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { domainIcons } from "../icons.js";

import { Button } from "./button.js";
import { CommandPalette, type CommandPaletteGroup } from "./command-palette.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full">
    <Story />
  </div>
);

function groups(close: () => void): CommandPaletteGroup[] {
  const item = (
    id: string,
    label: string,
    icon: keyof typeof domainIcons,
    shortcut?: string,
    hint?: string,
  ) => {
    const Icon = domainIcons[icon];
    return { id, label, hint, icon: <Icon />, shortcut, onSelect: close };
  };
  return [
    {
      // Recent pages name their area at the row's end (hint).
      heading: "Terakhir dibuka",
      items: [
        item("attendance", "Absensi dan jurnal", "attendance", undefined, "Pembelajaran"),
        item("library", "Sirkulasi perpustakaan", "library", undefined, "Perpustakaan"),
      ],
    },
    {
      heading: "Aksi cepat",
      items: [
        item("scan", "Pindai QR", "scan", "G S"),
        item("permit", "Ajukan izin keluar", "exitPermit"),
        item("violation", "Catat pelanggaran", "violation"),
        item("announce", "Buat pengumuman", "announcement"),
      ],
    },
    {
      heading: "Halaman",
      items: [
        item("late", "Keterlambatan", "late"),
        item("schedule", "Jadwal dan kalender", "schedule"),
        item("catalogue", "Katalog buku", "library"),
        item("reports", "Laporan", "document"),
      ],
    },
  ];
}

function CommandPaletteDemo() {
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
  };
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Buka pencarian
      </Button>
      <CommandPalette open={open} onOpenChange={setOpen} groups={groups(close)} />
    </>
  );
}

const meta: Meta = {
  title: "Components/CommandPalette",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <CommandPaletteDemo /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <CommandPaletteDemo /> };
export const Phone: Story = { decorators: [phoneFrame], render: () => <CommandPaletteDemo /> };

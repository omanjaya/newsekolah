import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { domainIcons } from "../icons.js";

import { Button } from "./button.js";
import { CommandPalette } from "./command-palette.js";

function CommandPaletteDemo() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Buka pencarian
      </Button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        groups={[
          {
            heading: "Halaman",
            items: [
              {
                id: "attendance",
                label: "Presensi",
                icon: <domainIcons.attendance />,
                onSelect: () => {
                  setOpen(false);
                },
              },
              {
                id: "library",
                label: "Perpustakaan",
                icon: <domainIcons.library />,
                onSelect: () => {
                  setOpen(false);
                },
              },
            ],
          },
          {
            heading: "Aksi",
            items: [
              {
                id: "announce",
                label: "Buat pengumuman",
                icon: <domainIcons.announcement />,
                onSelect: () => {
                  setOpen(false);
                },
              },
            ],
          },
        ]}
      />
    </>
  );
}

const meta: Meta<typeof CommandPaletteDemo> = {
  title: "Components/CommandPalette",
  component: CommandPaletteDemo,
};
export default meta;
type Story = StoryObj<typeof CommandPaletteDemo>;

export const Default: Story = {};

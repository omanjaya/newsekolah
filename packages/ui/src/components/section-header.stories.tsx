import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { Plus } from "lucide-react";

import { Button } from "./button.js";
import { SectionHeader } from "./section-header.js";
import { TextLink } from "./text-link.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

const meta: Meta<typeof SectionHeader> = {
  title: "Components/SectionHeader",
  component: SectionHeader,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof SectionHeader>;

function Gallery() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <SectionHeader title="Hari ini" action={<TextLink href="#">Lihat semua</TextLink>} />
      <SectionHeader
        title="Perlu tindakan"
        count={3}
        action={<TextLink href="#">Buka antrean</TextLink>}
      />
      <SectionHeader
        title="Jadwal pelajaran"
        description="Jam pelajaran per hari, dipakai presensi dan jurnal mengajar."
        action={
          <Button size="sm" variant="secondary" icon={<Plus />}>
            Tambah jam
          </Button>
        }
      />
      <SectionHeader title="Riwayat" />
    </div>
  );
}

export const Default: Story = { render: () => <Gallery /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Gallery />,
};

import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button.js";
import { HeroCard } from "./hero-card.js";

const meta: Meta<typeof HeroCard> = {
  title: "Components/HeroCard",
  component: HeroCard,
};
export default meta;
type Story = StoryObj<typeof HeroCard>;

export const Default: Story = {
  args: {
    eyebrow: "Sekarang",
    title: "Matematika · X-A",
    meta: "08.40-10.00 · presensi belum dikirim",
    chip: "12 menit lagi",
    action: <Button variant="primary">Isi presensi</Button>,
  },
};

export const WithoutAction: Story = {
  args: {
    eyebrow: "Hari ini",
    title: "Tidak ada jadwal",
  },
};

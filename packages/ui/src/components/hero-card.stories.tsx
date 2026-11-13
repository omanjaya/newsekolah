import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { ScanLine } from "lucide-react";

import { Button } from "./button.js";
import { HeroCard } from "./hero-card.js";
import { TextLink } from "./text-link.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-5">
    <Story />
  </div>
);

const meta: Meta<typeof HeroCard> = {
  title: "Components/HeroCard",
  component: HeroCard,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof HeroCard>;

function Tones() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <HeroCard
        eyebrow="Pelajaran berikutnya"
        chip="12 menit lagi"
        title="Matematika"
        meta="08.40 - 10.00 · Ruang X-A · Bu Rina"
      />
      <HeroCard
        eyebrow="Sekarang"
        chip="Berlangsung"
        live
        title="Matematika · X-A"
        meta="07.00 - 08.30 · presensi belum dikirim"
        action={<Button>Isi presensi</Button>}
        secondaryAction={<TextLink href="#">Lihat jurnal</TextLink>}
      />
      <HeroCard
        tone="neutral"
        eyebrow="Hari ini"
        title="Tidak ada jadwal lagi"
        meta="Semua presensi hari ini sudah terkirim."
        action={
          <Button variant="secondary" icon={<ScanLine />}>
            Pindai kartu
          </Button>
        }
      />
      <HeroCard
        tone="warning"
        eyebrow="Perlu tindakan"
        chip="Lewat 2 hari"
        title="3 jurnal belum diisi"
        meta="Kelas X-A, X-B dan XI IPA 1"
        action={<Button>Isi jurnal</Button>}
      />
    </div>
  );
}

export const Default: Story = { render: () => <Tones /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Tones /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Tones />,
};

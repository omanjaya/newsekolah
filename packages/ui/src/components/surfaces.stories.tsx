import type { Meta, StoryObj } from "@storybook/react";
import { BookOpen, CalendarCheck, FileText, Star } from "lucide-react";

import { Avatar } from "./avatar.js";
import { HeroCard } from "./hero-card.js";
import { ListRow } from "./list-row.js";
import { List } from "./list.js";
import { PageHeader } from "./page-header.js";
import { SectionHeader } from "./section-header.js";
import { Stat, StatGrid } from "./stat.js";
import { TextLink } from "./text-link.js";

/**
 * The "Hijau Segar" student home artboard (docs/design-reference-hijau-segar.html)
 * rebuilt from the shared components only, to compare the two side by side:
 * 20px page margins, the greeting, the hero, four tiles, and "Hari ini".
 */
const meta: Meta = {
  title: "Patterns/Student home (artboard)",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

function Home() {
  return (
    <div className="mx-auto flex w-[390px] max-w-full flex-col gap-5 px-5 pt-6 pb-8">
      <div className="flex items-center justify-between gap-3">
        <PageHeader eyebrow="SMA Contoh · Kamis, 25 Sep" title="Halo, Nadia" className="pb-0" />
        <Avatar name="Nadia Ayu" size={44} tone="accent" />
      </div>
      <HeroCard
        eyebrow="Pelajaran berikutnya"
        chip="12 menit lagi"
        title="Matematika"
        meta="08.40 - 10.00 · Ruang X-A · Bu Rina"
      />
      <StatGrid variant="tiles" className="-mt-1.5 sm:grid-cols-2">
        <Stat icon={<CalendarCheck />} category="green" value="96%" label="Kehadiran" href="#a" />
        <Stat icon={<FileText />} category="amber" value={1} label="Izin menunggu" href="#b" />
        <Stat icon={<Star />} category="purple" value={3} label="Nilai baru" href="#c" />
        <Stat icon={<BookOpen />} category="blue" value="2 buku" label="Kembali Sabtu" href="#d" />
      </StatGrid>
      <section className="flex flex-col gap-2.5">
        <SectionHeader title="Hari ini" action={<TextLink href="#">Lihat semua</TextLink>} />
        <List framed>
          <ListRow
            leading={<span className="w-11 text-label text-accent tabular-nums">10.15</span>}
            title="Bahasa Indonesia"
            trailing="Ruang X-A"
          />
          <ListRow
            leading={<span className="w-11 text-label text-accent tabular-nums">12.30</span>}
            title="Fisika"
            trailing="Lab IPA"
          />
        </List>
      </section>
    </div>
  );
}

export const Light: Story = { render: () => <Home /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Home /> };

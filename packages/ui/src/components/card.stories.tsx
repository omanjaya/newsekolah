import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { BookOpen, CalendarCheck, ChevronRight, Megaphone } from "lucide-react";

import { Badge } from "./badge.js";
import { Button } from "./button.js";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card.js";
import { IconCircle } from "./icon-circle.js";
import { ListRow } from "./list-row.js";
import { List } from "./list.js";
import { TextLink } from "./text-link.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full">
    <Story />
  </div>
);

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Card>;

function Sectioned() {
  return (
    <Card>
      <CardHeader action={<TextLink href="#">Lihat semua</TextLink>}>
        <CardTitle>Pengumuman</CardTitle>
        <CardDescription>Diperbarui 2 jam lalu</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-body text-fg">
          Ujian tengah semester dimulai Senin depan. Jadwal per kelas ada di menu Jadwal.
        </p>
      </CardContent>
      <CardFooter className="justify-end">
        <Button variant="secondary" size="sm">
          Tandai dibaca
        </Button>
        <Button size="sm">Buka</Button>
      </CardFooter>
    </Card>
  );
}

function WithList() {
  return (
    <Card>
      <CardHeader action={<TextLink href="#">Lihat semua</TextLink>}>
        <CardTitle>Hari ini</CardTitle>
      </CardHeader>
      <List>
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
    </Card>
  );
}

function Padded() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {(["sm", "md", "lg"] as const).map((padding) => (
        <Card key={padding} padding={padding}>
          <CardHeader>
            <CardTitle>Padding {padding}</CardTitle>
            <CardDescription>The card holds the inset; sections line up on it.</CardDescription>
          </CardHeader>
          <CardContent className="text-body text-fg">Isi kartu.</CardContent>
          <CardFooter>
            <Button variant="secondary" size="sm">
              Aksi
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

function Tones() {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card padding="md">
        <CardTitle>Default</CardTitle>
        <CardDescription>Surface, hairline ring, elevation 1.</CardDescription>
      </Card>
      <Card padding="md" tone="sunken">
        <CardTitle>Sunken</CardTitle>
        <CardDescription>A well inside another surface.</CardDescription>
      </Card>
      <Card padding="md" tone="accent-soft">
        <CardTitle>Accent soft</CardTitle>
        <CardDescription>The one card that says "now".</CardDescription>
      </Card>
      <Card padding="md" tone="raised">
        <CardTitle>Raised</CardTitle>
        <CardDescription>Floats above the page.</CardDescription>
      </Card>
    </div>
  );
}

const LINKS = [
  {
    icon: <CalendarCheck />,
    tone: "green",
    title: "Presensi",
    body: "Isi kehadiran kelas hari ini.",
  },
  {
    icon: <BookOpen />,
    tone: "blue",
    title: "Perpustakaan",
    body: "Pinjaman, kunjungan dan katalog.",
  },
  { icon: <Megaphone />, tone: "purple", title: "Pengumuman", body: "Kabar untuk guru dan siswa." },
] as const;

function Interactive() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {LINKS.map((link) => (
        <Card key={link.title} interactive asChild padding="md">
          <a href="#card">
            <div className="flex items-start justify-between gap-3">
              <IconCircle tone={link.tone}>{link.icon}</IconCircle>
              <ChevronRight className="size-4 text-fg-muted" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <CardTitle as="p">{link.title}</CardTitle>
              <CardDescription>{link.body}</CardDescription>
            </div>
          </a>
        </Card>
      ))}
      <Card interactive asChild padding="md" tone="sunken">
        <button type="button">
          <CardTitle as="p">Sunken button</CardTitle>
          <CardDescription>State layer instead of a lift.</CardDescription>
        </button>
      </Card>
      <Card interactive asChild padding="md" tone="accent-soft">
        <a href="#card">
          <div className="flex items-center justify-between">
            <CardTitle as="p">Accent soft link</CardTitle>
            <Badge tone="accent" appearance="solid">
              Baru
            </Badge>
          </div>
          <CardDescription>Pressed scales to 0.98.</CardDescription>
        </a>
      </Card>
      <Card interactive asChild padding="md" aria-disabled="true">
        <a href="#card" tabIndex={-1}>
          <CardTitle as="p">Disabled</CardTitle>
          <CardDescription>aria-disabled dims it and stops the pointer.</CardDescription>
        </a>
      </Card>
    </div>
  );
}

function Gallery() {
  return (
    <div className="flex max-w-default flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Sectioned />
        <WithList />
      </div>
      <Padded />
      <Tones />
      <Interactive />
    </div>
  );
}

export const Default: Story = { render: () => <Gallery /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => (
    <div className="flex flex-col gap-4 p-4">
      <WithList />
      <Sectioned />
      <Interactive />
    </div>
  ),
};

import type { Meta, StoryObj } from "@storybook/react";
import { Bell, BookOpen, FileText, MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { phoneViewport } from "../stories/phone-viewport.js";

import { Avatar } from "./avatar.js";
import { Button } from "./button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./card.js";
import { Dialog, DialogContent, DialogTrigger } from "./dialog.js";
import { IconButton } from "./icon-button.js";
import { IconCircle } from "./icon-circle.js";
import { ListRow } from "./list-row.js";
import { List } from "./list.js";
import { SectionHeader } from "./section-header.js";
import { SemanticStatusBadge } from "./semantic-status.js";
import { TextLink } from "./text-link.js";

const meta: Meta<typeof List> = {
  title: "Components/List",
  component: List,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof List>;

/** The artboard's "Hari ini" block: a section title with its link, a framed list. */
function Today() {
  return (
    <section className="flex flex-col gap-3">
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
  );
}

function People() {
  return (
    <Card>
      <CardHeader action={<TextLink href="#">Semua siswa</TextLink>}>
        <CardTitle>Perlu perhatian</CardTitle>
      </CardHeader>
      <List variant="inset">
        <ListRow
          href="#nadia"
          leading={<Avatar name="Nadia Putri" size={40} decorative />}
          title="Nadia Putri"
          meta="X-A · 3 kali alfa minggu ini"
          trailing={<SemanticStatusBadge status="overdue" label="Perlu ditindak" size="sm" />}
        />
        <ListRow
          href="#budi"
          leading={<Avatar name="Budi Santoso" size={40} decorative />}
          title="Budi Santoso"
          meta="X-A · Nilai Matematika di bawah KKM"
          trailing={<SemanticStatusBadge status="pending" label="Dipantau" size="sm" />}
        />
        <ListRow
          leading={<Avatar name="Sari Dewi" size={40} decorative />}
          title="Sari Dewi"
          meta="X-B · Izin sakit sejak Senin"
          action={
            <IconButton size="sm" aria-label="Aksi untuk Sari Dewi" icon={<MoreHorizontal />} />
          }
        />
      </List>
    </Card>
  );
}

function Notifications() {
  const [selected, setSelected] = useState("2");
  const items = [
    {
      id: "1",
      icon: <FileText />,
      tone: "amber",
      title: "Izin baru dari Nadia",
      meta: "Wali kelas perlu meninjau sebelum 12.00.",
      time: "08.12",
    },
    {
      id: "2",
      icon: <BookOpen />,
      tone: "blue",
      title: "Buku jatuh tempo besok",
      meta: "Laskar Pelangi, salinan 2 dari 4.",
      time: "07.30",
    },
    {
      id: "3",
      icon: <Bell />,
      tone: "purple",
      title: "Pengumuman ujian",
      meta: "Ujian tengah semester dimulai Senin.",
      time: "Kemarin",
    },
  ] as const;
  return (
    <List framed>
      {items.map((item) => (
        <ListRow
          key={item.id}
          onClick={() => {
            setSelected(item.id);
          }}
          selected={selected === item.id}
          leading={<IconCircle tone={item.tone}>{item.icon}</IconCircle>}
          title={item.title}
          meta={item.meta}
          trailing={item.time}
        />
      ))}
      <ListRow
        disabled
        onClick={() => undefined}
        leading={<IconCircle>{<Bell />}</IconCircle>}
        title="Notifikasi diarsipkan"
        meta="Tidak bisa dibuka lagi."
      />
    </List>
  );
}

function Dense() {
  return (
    <List framed dense variant="divided">
      {["Agus Pratama", "Made Ari", "Rina Wulandari", "Sari Dewi"].map((name, index) => (
        <ListRow
          key={name}
          href={`#${String(index)}`}
          leading={<Avatar name={name} size={24} decorative />}
          title={name}
          trailing={String(80 + index * 4)}
        />
      ))}
    </List>
  );
}

function Gallery() {
  return (
    <div className="grid max-w-default gap-6 md:grid-cols-2">
      <div className="flex flex-col gap-6">
        <Today />
        <Dense />
      </div>
      <div className="flex flex-col gap-6">
        <People />
        <Notifications />
      </div>
    </div>
  );
}

const SUBJECTS = ["Matematika", "Fisika", "Kimia"];

function Rows() {
  return (
    <List>
      {SUBJECTS.map((subject) => (
        <ListRow key={subject} href={`#${subject}`} title={subject} meta="Bu Rina · Ruang X-A" />
      ))}
    </List>
  );
}

/**
 * Only a list placed straight in a Card spans it edge to edge; one inside
 * CardContent, a column of a padded card or a dialog opened from a card
 * keeps its own 16px row inset and stays inside its container's padding.
 */
function Nesting() {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid max-w-default items-start gap-6 md:grid-cols-2">
      <Card padding="md" data-testid="direct">
        <CardTitle>Langsung di kartu</CardTitle>
        <Rows />
      </Card>
      <Card data-testid="in-content">
        <CardHeader>
          <CardTitle>Di dalam CardContent</CardTitle>
        </CardHeader>
        <CardContent>
          <Rows />
        </CardContent>
      </Card>
      <Card padding="md" data-testid="in-column">
        <CardTitle>Di kolom kartu berpadding</CardTitle>
        <div className="grid grid-cols-2 gap-4">
          <section className="rounded-md bg-surface-sunken">
            <Rows />
          </section>
          <p className="text-body-sm text-fg-muted">
            Kolom tetangga tidak tertimpa oleh daftar di sebelahnya.
          </p>
        </div>
      </Card>
      <Card padding="md" data-testid="with-dialog">
        <CardTitle>Dialog dari kartu</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary">Buka rincian</Button>
          </DialogTrigger>
          <DialogContent title="Rincian jadwal">
            <Rows />
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}

export const InACard: Story = { render: () => <Nesting /> };

export const Default: Story = { render: () => <Gallery /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneViewport],
  render: () => <Gallery />,
};

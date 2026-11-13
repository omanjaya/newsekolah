import type { Meta, StoryObj } from "@storybook/react";
import { X } from "lucide-react";

import { phoneViewport } from "../stories/phone-viewport.js";

import { Badge, type BadgeAppearance, type BadgeTone } from "./badge.js";
import { CountBadge } from "./count-badge.js";
import { IconButton } from "./icon-button.js";

const meta: Meta<typeof Badge> = {
  title: "Components/Badge",
  component: Badge,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Badge>;

const TONES: { tone: BadgeTone; label: string }[] = [
  { tone: "neutral", label: "Draf" },
  { tone: "accent", label: "Utama" },
  { tone: "success", label: "Disetujui" },
  { tone: "warning", label: "Menunggu" },
  { tone: "danger", label: "Ditolak" },
  { tone: "info", label: "Berjalan" },
  { tone: "green", label: "Akademik" },
  { tone: "amber", label: "Izin" },
  { tone: "purple", label: "Nilai" },
  { tone: "blue", label: "Perpustakaan" },
  { tone: "red", label: "Disiplin" },
];
const APPEARANCES: BadgeAppearance[] = ["soft", "solid", "outline"];

function Matrix() {
  return (
    <div className="flex flex-col gap-6">
      {APPEARANCES.map((appearance) => (
        <div key={appearance} className="flex flex-col gap-2">
          <p className="text-caption text-fg-muted">{appearance}</p>
          <div className="flex flex-wrap gap-2">
            {TONES.map(({ tone, label }) => (
              <Badge key={tone} tone={tone} appearance={appearance}>
                {label}
              </Badge>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <p className="text-caption text-fg-muted">dot, sizes md and sm</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success" dot>
            Aktif
          </Badge>
          <Badge tone="warning" dot>
            Menunggu
          </Badge>
          <Badge tone="neutral" dot appearance="outline">
            Nonaktif
          </Badge>
          <Badge tone="accent" size="sm">
            Baru
          </Badge>
          <Badge tone="danger" size="sm" dot>
            Lewat tenggat
          </Badge>
          <Badge tone="accent" appearance="solid" className="font-bold">
            12 menit lagi
          </Badge>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-caption text-fg-muted">CountBadge</p>
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-2 text-label text-fg">
            Menunggu <CountBadge count={3} />
          </span>
          <span className="inline-flex items-center gap-2 text-label text-fg">
            Perlu tindakan <CountBadge count={12} tone="accent" />
          </span>
          <span className="inline-flex items-center gap-2 text-label text-fg">
            Terlambat <CountBadge count={140} tone="danger" />
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken p-1">
            <span className="inline-flex h-8 items-center gap-2 rounded-full bg-surface px-3 text-label text-fg shadow-1">
              Semua <CountBadge count={128} max={999} />
            </span>
            <span className="inline-flex h-8 items-center gap-2 px-3 text-label text-fg-muted">
              Menunggu <CountBadge count={3} />
            </span>
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-caption text-fg-muted">
          a long label in a 160px column, and pills around a remove button
        </p>
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex w-40 flex-col items-start gap-2 rounded-md border border-dashed border-border-strong p-2">
            <Badge tone="blue">Pendidikan Pancasila dan Kewarganegaraan</Badge>
            <Badge tone="neutral" dot>
              Bahasa Indonesia Tingkat Lanjut
            </Badge>
          </div>
          <div className="flex max-w-80 flex-wrap items-center gap-2">
            {["kepala.sekolah@sman1.sch.id", "guru.matematika@sman1.sch.id", "tu@sman1.sch.id"].map(
              (email) => (
                <Badge key={email} tone="neutral" className="gap-0.5 pr-0">
                  {email}
                  <IconButton
                    size="sm"
                    icon={<X />}
                    aria-label={`Hapus ${email}`}
                    tooltip={false}
                  />
                </Badge>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const Default: Story = { render: () => <Matrix /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Matrix /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneViewport],
  render: () => <Matrix />,
};

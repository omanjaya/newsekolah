import { typeRoles, type TypeRoleName } from "@newsekolah/ui-tokens/dist/tokens.ts";
import type { Meta, StoryObj } from "@storybook/react";
import { Check, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";

import { Badge } from "../components/badge.js";
import { Button } from "../components/button.js";
import { Checkbox } from "../components/checkbox.js";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "../components/dialog.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/dropdown-menu.js";
import { Input } from "../components/input.js";
import { Progress } from "../components/progress.js";
import { Skeleton } from "../components/skeleton.js";
import { Switch } from "../components/switch.js";
import { useCountUp } from "../hooks/use-count-up.js";

/**
 * The foundation layer every component is built from: typography roles,
 * surfaces and elevation, semantic and state colors, and the motion
 * vocabulary (docs/superpowers/specs/2026-11-14-ui-overhaul-design.md
 * sections 3 and 4). Flip "Tema" in the toolbar for dark mode and use the
 * viewport menu for a phone width: the display role steps down below 640px.
 */
const meta: Meta = {
  title: "Foundations",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-heading text-fg">{title}</h2>
      {children}
    </section>
  );
}

// Full class names so Tailwind's scanner generates them.
const ROLE_CLASS: Record<TypeRoleName, string> = {
  display: "text-display",
  "title-lg": "text-title-lg",
  title: "text-title",
  heading: "text-heading",
  body: "text-body",
  "body-sm": "text-body-sm",
  label: "text-label",
  caption: "text-caption",
};

const ROLE_SAMPLE: Record<TypeRoleName, string> = {
  display: "Selamat datang, Nadia",
  "title-lg": "96%",
  title: "Terbitkan izin keluar",
  heading: "Hari ini",
  body: "Presensi kelas X-A sudah diisi untuk jam pertama.",
  "body-sm": "Wali kelas akan meninjau hari ini.",
  label: "Nama lengkap",
  caption: "Diperbarui 2 jam lalu",
};

export const TypeRoles: Story = {
  render: () => (
    <div className="flex max-w-default flex-col gap-6 p-6">
      <Section title="Peran tipografi">
        <div className="flex flex-col divide-y divide-line rounded-lg border border-border bg-surface">
          {(Object.keys(ROLE_CLASS) as TypeRoleName[]).map((name) => {
            const role = typeRoles[name];
            const compact = "compact" in role ? role.compact : undefined;
            return (
              <div
                key={name}
                className="grid gap-2 px-5 py-4 md:grid-cols-[10rem_1fr] md:items-baseline"
              >
                <div className="flex flex-col">
                  <code className="font-mono text-caption text-fg">text-{name}</code>
                  <span className="text-caption text-fg-muted">
                    {role.size}/{role.lineHeight} {role.weight}
                    {role.tracking !== "0" ? ` ${role.tracking}` : ""}
                    {compact ? `, HP ${compact.size}/${compact.lineHeight}` : ""}
                  </span>
                </div>
                <p className={`${ROLE_CLASS[name]} text-fg`}>{ROLE_SAMPLE[name]}</p>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  ),
};

// Lowest to highest: in dark mode each one is lighter than the one before.
const SURFACES = [
  ["surface-sunken", "bg-surface-sunken", "Sel isian, trek tab"],
  ["bg", "bg-bg", "Latar halaman"],
  ["surface", "bg-surface", "Kartu, tabel"],
  ["surface-overlay", "bg-surface-overlay", "Dialog"],
  ["surface-raised", "bg-surface-raised", "Popover, menu, lembar bawah (di atas dialog)"],
] as const;

const ELEVATION = [
  ["shadow-0", "shadow-0", "Rata"],
  ["shadow-1", "shadow-1", "Kartu (alias card)"],
  ["shadow-2", "shadow-2", "Popover dan menu"],
  ["shadow-3", "shadow-3", "Dialog (alias float)"],
] as const;

export const SurfacesAndElevation: Story = {
  render: () => (
    <div className="flex max-w-default flex-col gap-8 p-6">
      <Section title="Permukaan">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {SURFACES.map(([name, className, use]) => (
            <div key={name} className="flex flex-col gap-2">
              <div className={`h-20 rounded-lg border border-border ${className}`} />
              <code className="font-mono text-caption text-fg">{name}</code>
              <span className="text-caption text-fg-muted">{use}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Elevasi">
        <div className="grid grid-cols-2 gap-6 rounded-xl bg-surface-sunken p-6 md:grid-cols-4">
          {ELEVATION.map(([name, className, use]) => (
            <div
              key={name}
              className={`flex h-24 flex-col justify-end rounded-lg bg-surface-raised p-4 ${className}`}
            >
              <code className="font-mono text-caption text-fg">{name}</code>
              <span className="text-caption text-fg-muted">{use}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Batas dan fokus">
        <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-surface p-6">
          <div className="flex flex-col gap-1">
            <span className="text-label text-fg">Kontrol (border-strong)</span>
            <Input aria-label="Contoh isian" placeholder="Nama siswa" className="w-56" />
          </div>
          <span className="flex items-center gap-2 text-body-sm text-fg">
            <Checkbox defaultChecked aria-labelledby="foundation-present" />
            <span id="foundation-present">Hadir</span>
          </span>
          <span className="flex items-center gap-2 text-body-sm text-fg">
            <Checkbox checked="indeterminate" aria-labelledby="foundation-partial" />
            <span id="foundation-partial">Sebagian</span>
          </span>
          <span className="flex items-center gap-2 text-body-sm text-fg">
            <Switch defaultChecked aria-labelledby="foundation-publish" />
            <span id="foundation-publish">Terbitkan</span>
          </span>
          <button
            type="button"
            className="rounded-md bg-surface px-3 py-2 text-label text-fg outline-2 outline-offset-2 outline-focus-ring"
          >
            Cincin fokus
          </button>
        </div>
      </Section>
    </div>
  ),
};

const SEMANTIC = [
  ["success", Check, "Izin disetujui", "bg-success-soft text-success-soft-fg", "text-success"],
  [
    "warning",
    TriangleAlert,
    "Menunggu tinjauan",
    "bg-warning-soft text-warning-soft-fg",
    "text-warning",
  ],
  ["danger", OctagonAlert, "Gagal disimpan", "bg-danger-soft text-danger-soft-fg", "text-danger"],
  ["info", Info, "Tahun ajaran baru", "bg-info-soft text-info-soft-fg", "text-info"],
] as const;

export const SemanticColors: Story = {
  render: () => (
    <div className="flex max-w-default flex-col gap-8 p-6">
      <Section title="Warna semantik">
        <div className="grid gap-3 md:grid-cols-4">
          {SEMANTIC.map(([name, Icon, text, soft, fg]) => (
            <div
              key={name}
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-1"
            >
              <span className={`flex size-9 items-center justify-center rounded-full ${soft}`}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <code className="font-mono text-caption text-fg">{name}</code>
              <span className={`text-label ${fg}`}>{text}</span>
              <span className={`w-fit rounded-full px-2.5 py-0.5 text-caption ${soft}`}>
                {name}-soft
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">Hadir</Badge>
          <Badge variant="warning">Terlambat</Badge>
          <Badge variant="danger">Ditolak</Badge>
          <Badge variant="info">Baru</Badge>
          <Badge>Draf</Badge>
        </div>
      </Section>
      <Section title="Lapisan keadaan">
        <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="rounded-md bg-state-hover p-4 text-body-sm text-fg">state-hover</div>
          <div className="rounded-md bg-state-pressed p-4 text-body-sm text-fg">state-pressed</div>
          <div className="rounded-md bg-state-selected p-4 text-body-sm text-fg">
            state-selected
          </div>
        </div>
      </Section>
    </div>
  ),
};

function Replay({ children }: { children: (run: number) => ReactNode }) {
  const [run, setRun] = useState(0);
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="secondary"
        size="sm"
        className="w-fit"
        onClick={() => {
          setRun((value) => value + 1);
        }}
      >
        Putar ulang
      </Button>
      {children(run)}
    </div>
  );
}

function CountUpValue({ target }: { target: number }) {
  const value = useCountUp(target);
  return <span className="text-title-lg tabular-nums text-fg">{value}%</span>;
}

function MotionDemo() {
  const [progress, setProgress] = useState(30);
  return (
    <div className="flex max-w-default flex-col gap-8 p-6">
      <Section title="Masuk konten, berjenjang 40 ms">
        <Replay>
          {(run) => (
            <div key={run} className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {["Kehadiran", "Izin menunggu", "Nilai baru", "Buku dipinjam"].map((label, index) => (
                <div
                  key={label}
                  className="animate-enter flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 shadow-1"
                  style={{ "--stagger": index } as CSSProperties}
                >
                  {index === 0 ? (
                    <CountUpValue target={96} />
                  ) : (
                    <span className="text-title-lg text-fg">{index}</span>
                  )}
                  <span className="text-body-sm text-fg-muted">{label}</span>
                </div>
              ))}
            </div>
          )}
        </Replay>
      </Section>
      <Section title="Lapisan">
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Buka dialog</Button>
            </DialogTrigger>
            <DialogContent
              title="Terbitkan izin keluar"
              description="Pudar dan skala 0,97 ke 1 dalam 200 ms, keluar 120 ms."
              footer={
                <DialogClose asChild>
                  <Button variant="secondary" size="sm">
                    Tutup
                  </Button>
                </DialogClose>
              }
            >
              <p className="text-body-sm text-fg-muted">Scrim memudar 200 ms.</p>
            </DialogContent>
          </Dialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">Buka menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Ubah</DropdownMenuItem>
              <DropdownMenuItem>Arsipkan</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Section>
      <Section title="Umpan balik dan indikator">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Tekan saya</Button>
            <span className="flex items-center gap-2 text-body-sm text-fg">
              <span className="animate-live size-2 rounded-full bg-success" aria-hidden="true" />
              Sedang berlangsung
            </span>
            <Switch aria-label="Contoh switch" />
          </div>
          <Progress value={progress} label={`${progress}% terunggah`} />
          <Button
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() => {
              setProgress((value) => (value >= 100 ? 10 : value + 30));
            }}
          >
            Tambah progres
          </Button>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </Section>
    </div>
  );
}

export const Motion: Story = { render: () => <MotionDemo /> };

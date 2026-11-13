import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { BookOpen, CalendarCheck, DoorOpen, ScanLine } from "lucide-react";

import { Badge } from "./badge.js";
import { Button } from "./button.js";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetTrigger } from "./sheet.js";
import { Textarea } from "./textarea.js";

/** Open at a 390px viewport to see a drawer turn into a bottom sheet. */
const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full">
    <Story />
  </div>
);

const ACTIONS = [
  { label: "Pindai QR", icon: <ScanLine /> },
  { label: "Ajukan izin keluar", icon: <DoorOpen /> },
  { label: "Isi presensi", icon: <CalendarCheck /> },
  { label: "Pinjamkan buku", icon: <BookOpen /> },
];

function QuickActionsSheet() {
  return (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button>Aksi cepat</Button>
      </SheetTrigger>
      <SheetContent title="Aksi cepat">
        <ul className="grid gap-1">
          {ACTIONS.map((action) => (
            <li key={action.label}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-body text-fg transition-colors hover:bg-state-hover active:bg-state-pressed"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent [&>svg]:size-5">
                  {action.icon}
                </span>
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-body-sm text-fg-muted">{label}</dt>
      <dd className="text-body text-fg">{value}</dd>
    </div>
  );
}

function BillDrawer() {
  return (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button>Detail tagihan</Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        title="SPP November 2026"
        description="Nadia Putri, X-A"
        footer={
          <>
            <SheetClose asChild>
              <Button variant="secondary" size="sm">
                Tutup
              </Button>
            </SheetClose>
            <Button size="sm">Catat pembayaran</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Badge>Belum lunas</Badge>
          <dl className="divide-y divide-line">
            <DetailRow label="Nominal" value="Rp350.000" />
            <DetailRow label="Potongan" value="Rp0" />
            <DetailRow label="Jatuh tempo" value="10 November 2026" />
            <DetailRow label="Dibayar" value="Rp0" />
            <DetailRow label="Sisa" value="Rp350.000" />
          </dl>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NoteSheet() {
  return (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button>Catatan</Button>
      </SheetTrigger>
      <SheetContent side="right" size="lg" title="Catatan konseling">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="session-summary" className="text-label text-fg">
              Ringkasan sesi
            </label>
            <Textarea id="session-summary" rows={8} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="session-plan" className="text-label text-fg">
              Rencana tindak lanjut
            </label>
            <Textarea id="session-plan" rows={8} />
          </div>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="secondary" size="sm">
                Batal
              </Button>
            </SheetClose>
            <Button type="submit" size="sm">
              Simpan
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

const meta: Meta = {
  title: "Components/Sheet",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

export const Bottom: Story = { render: () => <QuickActionsSheet /> };
export const RightDrawer: Story = { render: () => <BillDrawer /> };
export const DrawerWithForm: Story = { render: () => <NoteSheet /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <BillDrawer /> };
export const DarkBottom: Story = {
  globals: { theme: "dark" },
  render: () => <QuickActionsSheet />,
};
export const Phone: Story = { decorators: [phoneFrame], render: () => <BillDrawer /> };

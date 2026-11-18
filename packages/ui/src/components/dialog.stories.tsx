import type { Decorator, Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";

import { Button } from "./button.js";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "./dialog.js";
import type { DialogSize } from "./dialog.js";
import { Input } from "./input.js";
import { Textarea } from "./textarea.js";

/**
 * Open a story at a 390px viewport (the screenshot script does) to see the
 * phone layout: the same dialog becomes a bottom sheet with a grab handle.
 * The decorator below only gives the page behind it a phone-like column.
 */
const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full">
    <Story />
  </div>
);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label text-fg">{label}</span>
      {children}
    </label>
  );
}

/** The shape about 70 forms in apps/web have today: the action row is the form's last child. */
function LegacyForm() {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <Field label="Nama lengkap">
        <Input defaultValue="Nadia Putri" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama pengguna">
          <Input placeholder="Dibuat otomatis jika kosong" />
        </Field>
        <Field label="Nomor HP">
          <Input placeholder="08..." inputMode="tel" />
        </Field>
      </div>
      <Field label="Email">
        <Input type="email" />
      </Field>
      <Field label="NIP">
        <Input />
      </Field>
      <Field label="Catatan">
        <Textarea rows={4} />
      </Field>
      <Field label="Alamat">
        <Textarea rows={3} />
      </Field>
      {/* Some existing rows pass size="sm"; the action row holds them to md's height. */}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <DialogClose asChild>
          <Button variant="secondary" size="sm">
            Batal
          </Button>
        </DialogClose>
        <Button type="submit" size="sm">
          Simpan
        </Button>
      </div>
    </form>
  );
}

function LegacyFormDialog({ size }: { size?: DialogSize }) {
  return (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>Pengguna baru</Button>
      </DialogTrigger>
      <DialogContent
        size={size}
        title="Pengguna baru"
        description="Akun dibuat aktif dan bisa langsung masuk."
      >
        <LegacyForm />
      </DialogContent>
    </Dialog>
  );
}

function FooterPropDialog() {
  return (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>Terbitkan izin</Button>
      </DialogTrigger>
      <DialogContent
        size="sm"
        title="Terbitkan izin keluar"
        description="Izin berlaku selama jam yang dipilih."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Batal</Button>
            </DialogClose>
            <Button>Terbitkan</Button>
          </>
        }
      >
        <p className="text-body text-fg">
          Nadia Putri, X-A, keluar pukul 10.15 sampai 11.00 untuk kontrol ke dokter.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function DialogFooterInForm() {
  return (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>Catat pelanggaran</Button>
      </DialogTrigger>
      <DialogContent size="lg" title="Catat pelanggaran">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Siswa">
              <Input defaultValue="Raka Pratama" />
            </Field>
            <Field label="Tanggal">
              <Input defaultValue="14 November 2026" />
            </Field>
          </div>
          <Field label="Jenis pelanggaran">
            <Input defaultValue="Terlambat masuk kelas" />
          </Field>
          <Field label="Kronologi">
            <Textarea rows={6} />
          </Field>
          <Field label="Tindak lanjut">
            <Textarea rows={4} />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Batal</Button>
            </DialogClose>
            <Button type="submit">Simpan catatan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SizesDemo() {
  const sizes: DialogSize[] = ["sm", "md", "lg", "xl"];
  return (
    <div className="flex flex-wrap gap-2">
      {sizes.map((size) => (
        <Dialog key={size}>
          <DialogTrigger asChild>
            <Button variant="secondary">Ukuran {size}</Button>
          </DialogTrigger>
          <DialogContent
            size={size}
            title={`Dialog ${size}`}
            description="Lebar dari 640px ke atas."
          >
            <p className="text-body text-fg-muted">Isi dialog.</p>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}

const meta: Meta = {
  title: "Components/Dialog",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

/** An unchanged legacy form: its action row sticks to the bottom while the fields scroll. */
export const LegacyFormStickyFooter: Story = { render: () => <LegacyFormDialog /> };
export const FooterProp: Story = { render: () => <FooterPropDialog /> };
export const FooterInsideForm: Story = { render: () => <DialogFooterInForm /> };
export const Sizes: Story = { parameters: { layout: "centered" }, render: () => <SizesDemo /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <LegacyFormDialog /> };
export const DarkFooterProp: Story = {
  globals: { theme: "dark" },
  render: () => <FooterPropDialog />,
};
export const Phone: Story = { decorators: [phoneFrame], render: () => <LegacyFormDialog /> };

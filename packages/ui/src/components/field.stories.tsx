import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { AtSign, Mail } from "lucide-react";
import { useState } from "react";

import { Button } from "./button.js";
import { Checkbox } from "./checkbox.js";
import { Combobox } from "./combobox.js";
import { DatePicker } from "./date-picker.js";
import { Field } from "./field.js";
import { FormActions, FormError, FormSection } from "./form-layout.js";
import { Input } from "./input.js";
import { NumberInput } from "./number-input.js";
import { PasswordInput } from "./password-input.js";
import { RadioGroup, RadioGroupItem } from "./radio-group.js";
import { SearchInput } from "./search-input.js";
import { Select } from "./select.js";
import { Textarea } from "./textarea.js";
import { TimePicker } from "./time-picker.js";

/**
 * The form family in one place: Field's label, hint, error and markers
 * around every control, FormSection's grid, FormActions and FormError.
 * Check that every control lines up (height, radius, border, text) in
 * both themes and at phone width.
 */
const TODAY = "2026-11-14";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

const CLASSES = [
  { value: "x-1", label: "Kelas X-1" },
  { value: "x-2", label: "Kelas X-2" },
  { value: "xi-ipa-1", label: "Kelas XI IPA 1", description: "Wali kelas: Bu Rina" },
];

const TEACHERS = [
  { value: "rina", label: "Rina Kartika", description: "NIP 19840512 201001 2 004" },
  { value: "budi", label: "Budi Santoso", description: "NIP 19790203 200501 1 002" },
];

function TeacherPicker() {
  const [value, setValue] = useState("");
  const [search, setSearch] = useState("");
  return (
    <Combobox
      options={TEACHERS.filter((teacher) =>
        teacher.label.toLowerCase().includes(search.toLowerCase()),
      )}
      value={value}
      onValueChange={setValue}
      search={search}
      onSearchChange={setSearch}
      placeholder="Pilih guru pengganti"
    />
  );
}

function StudentForm() {
  const [birthDate, setBirthDate] = useState("");
  const [start, setStart] = useState("07:15");
  const [days, setDays] = useState<number | null>(2);
  const [kind, setKind] = useState("sick");
  return (
    <form
      aria-label="Contoh formulir siswa"
      className="flex w-[44rem] max-w-full flex-col gap-8 rounded-lg border border-border bg-surface p-5 shadow-1 md:p-6"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <FormError errors={["Tanggal lahir wajib diisi", "Email sudah dipakai akun lain"]} />
      <FormSection
        title="Data siswa"
        description="Nama dan NIS tampil di rapor dan kartu perpustakaan."
      >
        <Field label="Nama lengkap" required>
          <Input defaultValue="Nadia Putri Lestari" autoComplete="name" />
        </Field>
        <Field label="NIS" hint="Nomor induk dari sekolah, 6 digit.">
          <Input defaultValue="231045" inputMode="numeric" />
        </Field>
        <Field label="Email" optional error="Email sudah dipakai akun lain">
          <Input
            type="email"
            defaultValue="nadia@contoh.sch.id"
            leading={<Mail aria-hidden="true" />}
          />
        </Field>
        <Field label="Tanggal lahir" required error="Tanggal lahir wajib diisi">
          <DatePicker value={birthDate} onChange={setBirthDate} today={TODAY} />
        </Field>
        <Field label="Kelas">
          <Select options={CLASSES} defaultValue="xi-ipa-1" />
        </Field>
        <Field label="Guru pengganti" hint="Cari dengan nama atau NIP.">
          <TeacherPicker />
        </Field>
        <Field label="Alamat" optional className="col-span-full">
          <Textarea autoResize rows={2} placeholder="Jalan, RT/RW, kelurahan" />
        </Field>
      </FormSection>
      <FormSection title="Izin" description="Pengajuan izin tidak masuk kelas.">
        <Field label="Jam keluar">
          <TimePicker value={start} onChange={setStart} minuteStep={5} />
        </Field>
        <Field label="Lama izin">
          <NumberInput value={days} onChange={setDays} min={1} max={14} stepper suffix="hari" />
        </Field>
        <Field label="Jenis izin" className="col-span-full">
          {(control) => (
            <RadioGroup
              value={kind}
              onValueChange={setKind}
              orientation="horizontal"
              aria-labelledby={control.labelId}
            >
              <RadioGroupItem value="sick" label="Sakit" />
              <RadioGroupItem value="family" label="Keperluan keluarga" />
              <RadioGroupItem value="other" label="Lainnya" />
            </RadioGroup>
          )}
        </Field>
        <Checkbox
          className="col-span-full"
          label="Kirim pemberitahuan ke orang tua"
          description="Lewat WhatsApp dan notifikasi aplikasi."
          defaultChecked
        />
      </FormSection>
      <FormActions>
        <Button variant="secondary">Batal</Button>
        <Button type="submit">Simpan siswa</Button>
      </FormActions>
    </form>
  );
}

function States() {
  return (
    <div className="grid w-[44rem] max-w-full gap-x-4 gap-y-5 rounded-lg border border-border bg-surface p-5 shadow-1 sm:grid-cols-2">
      <Field label="Kosong">
        <Input placeholder="Nama pengguna" />
      </Field>
      <Field label="Terisi">
        <Input defaultValue="guru01" leading={<AtSign aria-hidden="true" />} />
      </Field>
      <Field label="Dengan petunjuk" hint="Huruf kecil, tanpa spasi.">
        <Input defaultValue="guru01" />
      </Field>
      <Field label="Tidak valid" error="Nama pengguna sudah dipakai">
        <Input defaultValue="admin" />
      </Field>
      <Field label="Nonaktif" disabled>
        <Input defaultValue="Terkunci oleh admin" />
      </Field>
      <Field label="Kata sandi" labelAside={<a href="#reset">Lupa kata sandi?</a>}>
        <PasswordInput defaultValue="rahasia123" autoComplete="current-password" />
      </Field>
      <Field label="Cari">
        <SearchInput defaultValue="Nadia" />
      </Field>
      <Field label="Nominal" hint="Ukuran kecil, untuk filter dan toolbar.">
        <Input size="sm" defaultValue="150.000" leading="Rp" trailing="/bulan" />
      </Field>
      <Field label="Pilih kelas" error="Pilih salah satu kelas">
        <Select options={CLASSES} />
      </Field>
      <Field label="Kelas (nonaktif)" disabled>
        <Select options={CLASSES} defaultValue="x-1" />
      </Field>
    </div>
  );
}

function Horizontal() {
  return (
    <div className="flex w-[44rem] max-w-full flex-col gap-5 rounded-lg border border-border bg-surface p-5 shadow-1">
      <Field
        orientation="horizontal"
        label="Nama sekolah"
        hint="Tampil di kop surat dan halaman masuk."
      >
        <Input defaultValue="SMA Contoh" />
      </Field>
      <Field orientation="horizontal" label="Zona waktu">
        <Select
          options={[
            { value: "wib", label: "WIB (UTC+7)" },
            { value: "wita", label: "WITA (UTC+8)" },
          ]}
          defaultValue="wita"
        />
      </Field>
      <Field orientation="horizontal" label="Batas terlambat" error="Isi antara 1 dan 60 menit">
        <NumberInput defaultValue={90} suffix="menit" />
      </Field>
    </div>
  );
}

function Gallery() {
  return (
    <div className="flex flex-col gap-8">
      <StudentForm />
      <States />
      <Horizontal />
    </div>
  );
}

const meta: Meta<typeof Gallery> = {
  title: "Components/Field",
  component: Gallery,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Gallery>;

export const Light: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const Phone: Story = { parameters: { layout: "fullscreen" }, decorators: [phoneFrame] };

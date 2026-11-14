import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { expectNoAxeViolations } from "../test/axe.js";

import { Combobox } from "./combobox.js";
import { DatePicker } from "./date-picker.js";
import { DateRangePicker } from "./date-range-picker.js";
import { Dialog, DialogContent, DialogTrigger } from "./dialog.js";
import { Field } from "./field.js";
import { FormActions, FormError, FormSection } from "./form-layout.js";
import { Form, FormField } from "./form.js";
import { Input } from "./input.js";
import { MonthPicker } from "./month-picker.js";
import { NumberInput } from "./number-input.js";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.js";
import { Select } from "./select.js";
import { Textarea } from "./textarea.js";
import { TimePicker } from "./time-picker.js";
import { UiLabelsProvider } from "./ui-labels.js";

describe("Field", () => {
  it("labels the control inside it and describes it with the hint", () => {
    render(
      <Field label="NIS" hint="Enam digit dari sekolah.">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("NIS");
    expect(input).toHaveAccessibleDescription("Enam digit dari sekolah.");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks the control invalid and adds the error to its description", () => {
    render(
      <Field label="Email" hint="Untuk notifikasi." error="Email sudah dipakai">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Untuk notifikasi. Email sudah dipakai");
  });

  it("says required to assistive tech without the browser's own validation bubble", () => {
    render(
      <Field label="Nama" required>
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText(/Nama/);
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).not.toHaveAttribute("required");
  });

  it("shows the optional marker from UiLabels", () => {
    render(
      <UiLabelsProvider labels={{ fieldOptional: "(optional)" }}>
        <Field label="Alamat" optional>
          <Textarea />
        </Field>
      </UiLabelsProvider>,
    );
    expect(screen.getByText("(optional)")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Alamat (optional)" })).toBeInTheDocument();
  });

  it("follows a control's own id, so an existing id keeps its label", () => {
    render(
      <Field label="Kode buku">
        <Input id="barcode" />
      </Field>,
    );
    expect(screen.getByLabelText("Kode buku")).toHaveAttribute("id", "barcode");
  });

  it("wires the pickers, Select and NumberInput the same way", () => {
    render(
      <>
        <Field label="Tanggal" error="Wajib diisi">
          <DatePicker />
        </Field>
        <Field label="Kelas">
          <Select options={[{ value: "x", label: "X" }]} />
        </Field>
        <Field label="Lama" hint="Dalam hari.">
          <NumberInput />
        </Field>
      </>,
    );
    expect(screen.getByRole("combobox", { name: "Tanggal" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("combobox", { name: "Kelas" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Lama" })).toHaveAccessibleDescription(
      "Dalam hari.",
    );
  });

  it("wires Combobox, TimePicker, DateRangePicker and MonthPicker too", () => {
    render(
      <>
        <Field label="Pengganti" required hint="Guru yang sedang tidak mengajar.">
          <Combobox
            options={[]}
            value=""
            onValueChange={() => undefined}
            search=""
            onSearchChange={() => undefined}
          />
        </Field>
        <Field label="Jam masuk" error="Isi jam masuk">
          <TimePicker />
        </Field>
        <Field label="Periode" hint="Paling lama satu semester.">
          <DateRangePicker />
        </Field>
        <Field label="Bulan" disabled>
          <MonthPicker />
        </Field>
      </>,
    );
    // A button cannot carry aria-required, so its description says it.
    const combobox = screen.getByRole("button", { name: /Pengganti/ });
    expect(combobox).toHaveAccessibleDescription("Guru yang sedang tidak mengajar. Wajib diisi");
    expect(combobox).not.toHaveAttribute("aria-required");

    const time = screen.getByRole("combobox", { name: "Jam masuk" });
    expect(time).toHaveAttribute("aria-invalid", "true");
    expect(time).toHaveAccessibleDescription("Isi jam masuk");
    expect(screen.getByRole("combobox", { name: "Periode" })).toHaveAccessibleDescription(
      "Paling lama satu semester.",
    );
    expect(screen.getByRole("combobox", { name: "Bulan" })).toBeDisabled();
  });

  it("gives its id to the first control only, so a second keeps its own", () => {
    render(
      <Field label="Jam pelajaran" error="Jam selesai harus setelah jam mulai">
        <div className="flex gap-2">
          <TimePicker aria-label="Mulai" />
          <TimePicker aria-label="Selesai" />
        </div>
      </Field>,
    );
    const [start, end] = screen.getAllByRole("combobox");
    if (!start || !end) throw new Error("Missing pickers");
    expect(start.id).not.toBe("");
    expect(end.id).not.toBe(start.id);
    expect(screen.getByText("Jam pelajaran").closest("label")).toHaveAttribute("for", start.id);
    expect(start).toHaveAttribute("aria-invalid", "true");
    expect(end).not.toHaveAttribute("aria-invalid");
  });

  it("keeps a control inside a popover from a render-prop trigger out of the field's wiring", async () => {
    render(
      <Field label="Warna" error="Pilih warna">
        {(control) => (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" {...control}>
                Hijau
              </button>
            </PopoverTrigger>
            <PopoverContent>
              <Input aria-label="Kode hex" />
            </PopoverContent>
          </Popover>
        )}
      </Field>,
    );
    const trigger = screen.getByRole("button", { name: "Warna" });
    await userEvent.click(trigger);
    const inner = await screen.findByRole("textbox", { name: "Kode hex" });
    expect(inner.id).not.toBe(trigger.id);
    expect(inner).not.toHaveAttribute("aria-invalid");
    expect(inner).not.toHaveAttribute("aria-describedby");
    expect(screen.getByText("Warna").closest("label")).toHaveAttribute("for", trigger.id);
  });

  it("keeps a control in a dialog opened from beside the field's own control out of its wiring", async () => {
    render(
      <Field label="Kode buku" error="Kode tidak dikenal">
        <div className="flex gap-2">
          <Input />
          <Dialog>
            <DialogTrigger asChild>
              <button type="button">Cari</button>
            </DialogTrigger>
            <DialogContent title="Cari buku">
              <Input aria-label="Judul" />
            </DialogContent>
          </Dialog>
        </div>
      </Field>,
    );
    const own = screen.getByRole("textbox", { name: "Kode buku" });
    await userEvent.click(screen.getByRole("button", { name: "Cari" }));
    const inner = await screen.findByRole("textbox", { name: "Judul" });
    expect(inner.id).not.toBe(own.id);
    expect(inner).not.toHaveAttribute("aria-invalid");
    expect(own).toHaveAttribute("aria-invalid", "true");
  });

  it("hands ids to a control it does not know through a render prop", () => {
    render(
      <Field label="Warna" hint="Kode hex.">
        {(control) => <input {...control} />}
      </Field>,
    );
    expect(screen.getByLabelText("Warna")).toHaveAccessibleDescription("Kode hex.");
  });

  it("disables the control inside", () => {
    render(
      <Field label="Terkunci" disabled>
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Terkunci")).toBeDisabled();
  });

  it("shows a react-hook-form error inside FormField without being told", async () => {
    const schema = z.object({ username: z.string().min(1, "validation.required") });
    function Harness() {
      const form = useForm({ resolver: zodResolver(schema), defaultValues: { username: "" } });
      return (
        <Form
          form={form}
          translate={(key) => (key === "validation.required" ? "Wajib diisi" : key)}
          onSubmit={() => undefined}
        >
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <Field label="Nama pengguna">
                <Input {...field} />
              </Field>
            )}
          />
          <button type="submit">Kirim</button>
        </Form>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Kirim" }));
    const input = await screen.findByLabelText("Nama pengguna");
    expect(await screen.findByText("Wajib diisi")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Wajib diisi");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <div>
        <Field label="Nama" required hint="Sesuai akta.">
          <Input />
        </Field>
        <Field label="Email" error="Format email salah" orientation="horizontal">
          <Input type="email" />
        </Field>
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});

describe("Form layout", () => {
  it("names a section by its title and lays out its fields", () => {
    render(
      <FormSection title="Data siswa" description="Tampil di rapor.">
        <Field label="Nama">
          <Input />
        </Field>
      </FormSection>,
    );
    const section = screen.getByRole("region", { name: "Data siswa" });
    expect(section).toContainElement(screen.getByLabelText("Nama"));
  });

  it("announces the error summary with its default title and one line per problem", () => {
    render(<FormError errors={["Tanggal wajib diisi", "Email sudah dipakai"]} />);
    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent("Periksa kembali isian berikut");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("puts the action row in a sticky footer on request", () => {
    render(
      <FormActions sticky>
        <button type="button">Batal</button>
        <button type="submit">Simpan</button>
      </FormActions>,
    );
    const row = screen.getByRole("button", { name: "Simpan" }).parentElement;
    expect(row).toHaveClass("sticky", "bottom-0");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <form aria-label="Siswa">
        <FormError title="Belum tersimpan">Koneksi terputus.</FormError>
        <FormSection title="Data siswa" variant="card">
          <Field label="Nama">
            <Input />
          </Field>
        </FormSection>
        <FormActions align="between">
          <button type="button">Hapus</button>
          <button type="submit">Simpan</button>
        </FormActions>
      </form>,
    );
    await expectNoAxeViolations(container);
  });
});

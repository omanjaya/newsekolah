import { zodResolver } from "@hookform/resolvers/zod";
import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "./button.js";
import { Field } from "./field.js";
import { FormActions } from "./form-layout.js";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./form.js";
import { Input } from "./input.js";
import { Select } from "./select.js";

const schema = z.object({
  username: z.string().min(1, "validation.usernameRequired"),
});

const TRANSLATIONS: Record<string, string> = {
  "validation.usernameRequired": "Nama pengguna wajib diisi",
  "validation.nameRequired": "Nama siswa wajib diisi",
  "validation.classRequired": "Pilih kelas siswa",
  "validation.nisFormat": "NIS terdiri dari enam angka",
};

const translate = (key: string) => TRANSLATIONS[key] ?? key;

function LoginFormDemo() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { username: "" },
  });

  return (
    <Form
      form={form}
      translate={translate}
      onSubmit={(values) => {
        window.alert(JSON.stringify(values));
      }}
      className="flex w-72 max-w-full flex-col gap-4"
    >
      <FormField
        control={form.control}
        name="username"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nama pengguna</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormDescription>Sesuai akun yang diberikan sekolah.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <Button type="submit">Masuk</Button>
    </Form>
  );
}

const studentSchema = z.object({
  name: z.string().min(1, "validation.nameRequired"),
  nis: z.string().regex(/^\d{6}$/, "validation.nisFormat"),
  classId: z.string().min(1, "validation.classRequired"),
});

const CLASSES = [
  { value: "x-ipa-1", label: "X IPA 1" },
  { value: "x-ipa-2", label: "X IPA 2" },
  { value: "xi-ips-1", label: "XI IPS 1" },
];

/**
 * `Field` inside react-hook-form's `FormField`: the field's own error shows
 * under the control without an `error` prop, and the control is labelled,
 * described and marked invalid through context. Submit empty to see it.
 */
function StudentFormDemo() {
  const form = useForm<z.infer<typeof studentSchema>>({
    resolver: zodResolver(studentSchema),
    defaultValues: { name: "", nis: "12", classId: "" },
  });
  return (
    <Form
      form={form}
      translate={translate}
      onSubmit={() => undefined}
      className="flex w-96 max-w-full flex-col gap-5"
    >
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <Field label="Nama lengkap" required hint="Sesuai akta kelahiran.">
            <Input {...field} />
          </Field>
        )}
      />
      <FormField
        control={form.control}
        name="nis"
        render={({ field }) => (
          <Field label="NIS" required>
            <Input inputMode="numeric" {...field} />
          </Field>
        )}
      />
      <FormField
        control={form.control}
        name="classId"
        render={({ field }) => (
          <Field label="Kelas" required>
            <Select
              options={CLASSES}
              value={field.value}
              onValueChange={field.onChange}
              name={field.name}
            />
          </Field>
        )}
      />
      <FormActions>
        <Button variant="secondary" type="button">
          Batal
        </Button>
        <Button type="submit">Simpan siswa</Button>
      </FormActions>
    </Form>
  );
}

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

const meta: Meta<typeof LoginFormDemo> = {
  title: "Components/Form",
  component: LoginFormDemo,
};
export default meta;
type Story = StoryObj<typeof LoginFormDemo>;

export const Default: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const Phone: Story = { parameters: { layout: "fullscreen" }, decorators: [phoneFrame] };

/** Submitted once on mount, so the field errors show without a click. */
function SubmittedStudentForm() {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    frame.current?.querySelector<HTMLButtonElement>("button[type=submit]")?.click();
  }, []);
  return (
    <div ref={frame}>
      <StudentFormDemo />
    </div>
  );
}

export const FieldInFormField: StoryObj<typeof StudentFormDemo> = {
  render: () => <SubmittedStudentForm />,
};
export const FieldInFormFieldDark: StoryObj<typeof StudentFormDemo> = {
  render: () => <SubmittedStudentForm />,
  globals: { theme: "dark" },
};
export const FieldInFormFieldPhone: StoryObj<typeof StudentFormDemo> = {
  render: () => <SubmittedStudentForm />,
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
};

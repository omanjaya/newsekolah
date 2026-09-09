import { zodResolver } from "@hookform/resolvers/zod";
import type { Meta, StoryObj } from "@storybook/react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "./button.js";
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

const schema = z.object({
  username: z.string().min(1, "validation.usernameRequired"),
});

const TRANSLATIONS: Record<string, string> = {
  "validation.usernameRequired": "Nama pengguna wajib diisi",
};

function LoginFormDemo() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { username: "" },
  });

  return (
    <Form
      form={form}
      translate={(key) => TRANSLATIONS[key] ?? key}
      onSubmit={(values) => {
        window.alert(JSON.stringify(values));
      }}
      className="flex w-72 flex-col gap-4"
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

const meta: Meta<typeof LoginFormDemo> = {
  title: "Components/Form",
  component: LoginFormDemo,
};
export default meta;
type Story = StoryObj<typeof LoginFormDemo>;

export const Default: Story = {};

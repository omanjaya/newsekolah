import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { Button } from "./button.js";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "./form.js";
import { Input } from "./input.js";

const schema = z.object({
  username: z.string().min(1, "validation.usernameRequired"),
});

function TestForm({ onSubmit }: { onSubmit: (values: z.infer<typeof schema>) => void }) {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { username: "" },
  });
  return (
    <Form
      form={form}
      translate={(key) =>
        key === "validation.usernameRequired" ? "Nama pengguna wajib diisi" : key
      }
      onSubmit={onSubmit}
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
            <FormMessage />
          </FormItem>
        )}
      />
      <Button type="submit">Masuk</Button>
    </Form>
  );
}

describe("Form", () => {
  it("links the label to the input via htmlFor/id", () => {
    render(<TestForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Nama pengguna")).toBeInTheDocument();
  });

  it("shows the translated message and blocks submit when a required field is empty", async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nama pengguna wajib diisi");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the parsed values once valid", async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Nama pengguna"), "guru01");
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
    expect(onSubmit).toHaveBeenCalledWith({ username: "guru01" }, expect.anything());
  });
});

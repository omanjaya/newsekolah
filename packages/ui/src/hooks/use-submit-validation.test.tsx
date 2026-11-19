import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "../components/button.js";
import { Field } from "../components/field.js";
import { Input } from "../components/input.js";

import { useSubmitValidation } from "./use-submit-validation.js";

function Demo({ onSave }: { onSave: (values: { code: string; name: string }) => void }) {
  const { ref, attempted, check, reset } = useSubmitValidation();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const missing = (value: string) => (attempted && !value.trim() ? "Wajib diisi" : undefined);
  return (
    <form
      ref={ref}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!check(Boolean(code.trim() && name.trim()))) return;
        onSave({ code, name });
      }}
    >
      <Field label="Kode" required error={missing(code)}>
        <Input
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
          }}
        />
      </Field>
      <Field label="Nama" required error={missing(name)}>
        <Input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </Field>
      <Button type="submit">Simpan</Button>
      <Button type="button" variant="secondary" onClick={reset}>
        Ulang
      </Button>
    </form>
  );
}

function renderDemo() {
  const onSave = vi.fn();
  const view = render(<Demo onSave={onSave} />);
  return { onSave, ...view };
}

describe("useSubmitValidation", () => {
  it("keeps Submit enabled and shows no error before the first attempt", () => {
    renderDemo();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeEnabled();
    expect(screen.queryByText("Wajib diisi")).not.toBeInTheDocument();
  });

  it("explains every missing field and focuses the first on an incomplete submit", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDemo();
    await user.type(screen.getByRole("textbox", { name: "Nama" }), "Ani");
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getAllByText("Wajib diisi")).toHaveLength(1);
    const code = screen.getByRole("textbox", { name: "Kode" });
    expect(code).toHaveAttribute("aria-invalid", "true");
    expect(code).toHaveFocus();
  });

  it("submits once the form is complete", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDemo();
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await user.type(screen.getByRole("textbox", { name: "Kode" }), "B01");
    await user.type(screen.getByRole("textbox", { name: "Nama" }), "Buku");
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    expect(onSave).toHaveBeenCalledWith({ code: "B01", name: "Buku" });
    expect(screen.queryByText("Wajib diisi")).not.toBeInTheDocument();
  });

  it("forgets the attempt on reset", async () => {
    const user = userEvent.setup();
    renderDemo();
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getAllByText("Wajib diisi")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Ulang" }));
    expect(screen.queryByText("Wajib diisi")).not.toBeInTheDocument();
  });
});

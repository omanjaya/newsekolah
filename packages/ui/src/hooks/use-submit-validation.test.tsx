import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

/** A submit that also reveals the fields, as a form switching back from a preview tab does. */
function HiddenUntilSubmit() {
  const { ref, attempted, check } = useSubmitValidation<HTMLDivElement>();
  const [revealed, setRevealed] = useState(false);
  return (
    <div ref={ref}>
      {revealed && (
        <Field label="Judul" required error={attempted ? "Wajib diisi" : undefined}>
          <Input />
        </Field>
      )}
      <Button
        onClick={() => {
          check(false);
          // The content mounts a beat after the attempt, as a tab panel does.
          queueMicrotask(() => {
            setRevealed(true);
          });
        }}
      >
        Simpan
      </Button>
    </div>
  );
}

describe("useSubmitValidation", () => {
  afterEach(() => {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

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

  // A bare focus() scrolls only to the control, leaving its label cut off
  // above it; the whole Field is brought to the middle of the view.
  it("scrolls the first invalid field, label included, into view", async () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scroll,
    });
    const user = userEvent.setup();
    renderDemo();
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    const code = screen.getByRole("textbox", { name: "Kode" });
    expect(code).toHaveFocus();
    expect(scroll).toHaveBeenCalledOnce();
    expect(scroll).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
    const field = scroll.mock.contexts[0] as HTMLElement;
    expect(field).toHaveAttribute("data-slot", "field");
    expect(field).toContainElement(screen.getByText("Kode"));
  });

  it("focuses a field that mounts just after the attempt", async () => {
    const user = userEvent.setup();
    render(<HiddenUntilSubmit />);
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    const title = await screen.findByRole("textbox", { name: "Judul" });
    await vi.waitFor(() => {
      expect(title).toHaveFocus();
    });
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

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
    vi.restoreAllMocks();
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

  /** Lays the Kode field out at `top`..`top + height` (jsdom lays nothing out). */
  function placeField(top: number, height: number) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.slot === "field" && this.textContent.includes("Kode")) {
        return new DOMRect(0, top, 300, height);
      }
      // Everything else keeps jsdom's empty box.
      return new DOMRect();
    });
  }

  function stubScroll() {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scroll,
    });
    return scroll;
  }

  // A bare focus() scrolls only to the control, leaving its label cut off
  // above it; the whole Field is brought to the middle of the view.
  it("centres an out-of-view invalid field, label included", async () => {
    const scroll = stubScroll();
    placeField(window.innerHeight + 200, 80);
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

  it("leaves a field that is already in full view where it is", async () => {
    const scroll = stubScroll();
    placeField(100, 80);
    const user = userEvent.setup();
    renderDemo();
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    expect(screen.getByRole("textbox", { name: "Kode" })).toHaveFocus();
    expect(scroll).not.toHaveBeenCalled();
  });

  // Centring a Field taller than the view would cut its label off again.
  it("brings a field taller than the view in from its top", async () => {
    const scroll = stubScroll();
    placeField(-300, window.innerHeight + 400);
    const user = userEvent.setup();
    renderDemo();
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    expect(scroll).toHaveBeenCalledWith({ block: "start", inline: "nearest" });
  });

  it("counts a field clipped by its scroll area as out of view", async () => {
    const scroll = stubScroll();
    placeField(250, 80);
    const user = userEvent.setup();
    render(
      <div data-testid="area" style={{ overflowY: "auto" }}>
        <Demo onSave={vi.fn()} />
      </div>,
    );
    const area = screen.getByTestId("area");
    Object.defineProperty(area, "clientHeight", { configurable: true, value: 200 });
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    expect(scroll).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
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

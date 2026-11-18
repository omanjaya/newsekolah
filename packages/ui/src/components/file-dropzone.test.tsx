import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Field } from "./field.js";
import { FileDropzone, fileMatchesAccept } from "./file-dropzone.js";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function xlsx(name = "siswa.xlsx"): File {
  return new File(["data"], name, { type: XLSX_TYPE });
}

/** A drop of `files` on `target`, carrying them the way a browser does. */
function drop(target: Element, files: File[]) {
  const dataTransfer = { files, types: ["Files"], dropEffect: "none" };
  for (const type of ["dragEnter", "dragOver"] as const) {
    const event = createEvent[type](target);
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    fireEvent(target, event);
  }
  const event = createEvent.drop(target);
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  fireEvent(target, event);
}

describe("FileDropzone", () => {
  it("opens the picker from a real button and hands on the picked file", async () => {
    const onFile = vi.fn();
    const { container } = render(
      <FileDropzone
        onFile={onFile}
        accept=".xlsx"
        chooseLabel="Pilih berkas"
        title="Pilih berkas templat yang sudah diisi."
        hint="Format XLSX."
      />,
    );
    const button = screen.getByRole("button", { name: "Pilih berkas" });
    expect(button).toHaveAccessibleDescription(
      "Pilih berkas templat yang sudah diisi. Format XLSX.",
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("expected the file input");
    const click = vi.spyOn(input, "click");
    await userEvent.click(button);
    expect(click).toHaveBeenCalledOnce();

    await userEvent.upload(input, xlsx());
    expect(onFile).toHaveBeenCalledWith(expect.objectContaining({ name: "siswa.xlsx" }));
    // Cleared, so the same file can be picked again after a fix.
    expect(input.value).toBe("");
    await expectNoAxeViolations(container);
  });

  it("takes a dropped file and lights up while one is dragged over", () => {
    const onFile = vi.fn();
    const { container } = render(<FileDropzone onFile={onFile} chooseLabel="Pilih berkas" />);
    const zone = container.querySelector("[data-slot=file-dropzone]");
    if (!zone) throw new Error("expected the zone");

    const over = createEvent.dragOver(zone);
    Object.defineProperty(over, "dataTransfer", { value: { types: ["Files"], files: [] } });
    fireEvent(zone, over);
    expect(zone).toHaveAttribute("data-dragging");
    expect(zone).toHaveClass("border-accent", "bg-accent-soft");

    drop(zone, [xlsx("kelas.xlsx"), xlsx("lain.xlsx")]);
    expect(zone).not.toHaveAttribute("data-dragging");
    // The first of several files.
    expect(onFile).toHaveBeenCalledOnce();
    expect(onFile).toHaveBeenCalledWith(expect.objectContaining({ name: "kelas.xlsx" }));
  });

  it("refuses a dropped file of another type when it has words for it", () => {
    const onFile = vi.fn();
    const { container } = render(
      <FileDropzone
        onFile={onFile}
        accept=".xlsx"
        chooseLabel="Pilih berkas"
        rejectMessage="Berkas harus XLSX."
      />,
    );
    const zone = container.querySelector("[data-slot=file-dropzone]");
    if (!zone) throw new Error("expected the zone");
    drop(zone, [new File(["x"], "foto.png", { type: "image/png" })]);
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByText("Berkas harus XLSX.")).toBeInTheDocument();
    expect(zone).toHaveAttribute("data-invalid");
    expect(screen.getByRole("button", { name: "Pilih berkas" })).toHaveAccessibleDescription(
      "Berkas harus XLSX.",
    );

    drop(zone, [xlsx()]);
    expect(onFile).toHaveBeenCalledOnce();
    expect(screen.queryByText("Berkas harus XLSX.")).not.toBeInTheDocument();
  });

  it("shows the chosen file and offers to replace it", () => {
    render(
      <FileDropzone
        onFile={vi.fn()}
        fileName="siswa-kelas-x.xlsx"
        chooseLabel="Pilih berkas"
        replaceLabel="Ganti berkas"
        title="Belum ada berkas"
      />,
    );
    expect(screen.queryByText("Belum ada berkas")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ganti berkas" })).toHaveAccessibleDescription(
      "siswa-kelas-x.xlsx",
    );
  });

  it("is named by a surrounding Field, described by its hint and error, and disabled with it", async () => {
    const { container, rerender } = render(
      <Field label="Berkas pengguna" hint="Maksimal 5000 baris.">
        <FileDropzone onFile={vi.fn()} chooseLabel="Pilih berkas" />
      </Field>,
    );
    const button = screen.getByRole("button", { name: "Berkas pengguna Pilih berkas" });
    expect(button).toHaveAccessibleDescription("Maksimal 5000 baris.");
    // The field's label points at the hidden input, so clicking it opens the picker.
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(screen.getByText("Berkas pengguna")).toHaveAttribute("for", input?.id);
    await expectNoAxeViolations(container);

    rerender(
      <Field label="Berkas pengguna" error="Berkas tidak bisa dibaca." disabled>
        <FileDropzone onFile={vi.fn()} chooseLabel="Pilih berkas" />
      </Field>,
    );
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Berkas tidak bisa dibaca.");
    expect(container.querySelector("[data-slot=file-dropzone]")).toHaveAttribute("data-invalid");
  });

  it("takes no drop while it is busy", () => {
    const onFile = vi.fn();
    const { container } = render(
      <FileDropzone onFile={onFile} chooseLabel="Pilih berkas" loading />,
    );
    const zone = container.querySelector("[data-slot=file-dropzone]");
    if (!zone) throw new Error("expected the zone");
    drop(zone, [xlsx()]);
    expect(onFile).not.toHaveBeenCalled();
    expect(zone).toHaveAttribute("aria-busy", "true");
  });
});

describe("fileMatchesAccept", () => {
  it("reads extensions, exact types and type families", () => {
    expect(fileMatchesAccept({ name: "Siswa.XLSX", type: "" }, ".xlsx")).toBe(true);
    expect(fileMatchesAccept({ name: "a.csv", type: "text/csv" }, ".xlsx, text/csv")).toBe(true);
    expect(fileMatchesAccept({ name: "a.jpg", type: "image/jpeg" }, "image/*")).toBe(true);
    expect(fileMatchesAccept({ name: "a.pdf", type: "application/pdf" }, ".xlsx,image/*")).toBe(
      false,
    );
    expect(fileMatchesAccept({ name: "a.pdf", type: "application/pdf" }, " ")).toBe(true);
  });
});

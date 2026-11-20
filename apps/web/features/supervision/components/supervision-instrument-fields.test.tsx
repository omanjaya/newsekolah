import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SupervisionInstrumentFields } from "./supervision-instrument-fields";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    values?.index ? `${key} ${values.index}` : key,
}));

afterEach(cleanup);

describe("SupervisionInstrumentFields", () => {
  it("gives every criterion input an accessible name that includes its row number", () => {
    render(
      <SupervisionInstrumentFields
        instrument={{
          name: "Instrumen",
          scale_min: 1,
          scale_max: 4,
          criteria: [
            { key: "a", name: "Pembukaan" },
            { key: "b", name: "Penutup" },
          ],
        }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox", { name: "criterionKeyLabel 1" })).toHaveValue("a");
    expect(screen.getByRole("textbox", { name: "criterionNameLabel 2" })).toHaveValue("Penutup");
  });

  it("numbers the code of a criterion named like another one", () => {
    const onChange = vi.fn();
    render(
      <SupervisionInstrumentFields
        instrument={{
          name: "Instrumen",
          scale_min: 1,
          scale_max: 4,
          criteria: [
            { key: "penguasaan_kelas", name: "Penguasaan kelas" },
            { key: "", name: "" },
          ],
        }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "criterionNameLabel 2" }), {
      target: { value: "Penguasaan kelas" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        criteria: [
          { key: "penguasaan_kelas", name: "Penguasaan kelas" },
          { key: "penguasaan_kelas_2", name: "Penguasaan kelas" },
        ],
      }),
    );
  });

  it("marks both rows when a code is typed twice", () => {
    render(
      <SupervisionInstrumentFields
        instrument={{
          name: "Instrumen",
          scale_min: 1,
          scale_max: 4,
          criteria: [
            { key: "pk", name: "Penguasaan kelas" },
            { key: "pk", name: "Pengelolaan kelas" },
          ],
        }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox", { name: "criterionKeyLabel 1" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "criterionKeyLabel 2" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getAllByText("criterionKeyDuplicate")).toHaveLength(2);
  });
});

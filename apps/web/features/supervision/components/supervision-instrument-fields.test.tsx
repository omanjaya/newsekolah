import { cleanup, render, screen } from "@testing-library/react";
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
});

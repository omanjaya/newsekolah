import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { Card } from "./card.js";
import { DataList, DataListItem } from "./data-list.js";
import { UiLabelsProvider } from "./ui-labels.js";

describe("DataList", () => {
  it("is a valid definition list: one div per item holding one dt and one dd", async () => {
    const { container } = render(
      <DataList>
        <DataListItem label="NIS">2026010042</DataListItem>
        <DataListItem label="Kelas" hint="Wali kelas Bu Rina">
          X-A
        </DataListItem>
      </DataList>,
    );
    const items = Array.from(container.querySelector("dl")?.children ?? []);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.tagName).toBe("DIV");
      expect(Array.from(item.children).map((child) => child.tagName)).toEqual(["DT", "DD"]);
    }
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(["NIS", "Kelas"]);
    await expectNoAxeViolations(container);
  });

  it("shows a dash for a missing value and says so to a screen reader", () => {
    render(
      <UiLabelsProvider labels={{ dataListNoValue: "No value" }}>
        <DataList>
          <DataListItem label="Telepon" />
        </DataList>
      </UiLabelsProvider>,
    );
    expect(screen.getByText("No value")).toHaveClass("sr-only");
  });

  it("lays out a stacked grid with a full-width item", () => {
    const { container } = render(
      <DataList layout="stacked" columns={3}>
        <DataListItem label="Jenis">Izin keluar</DataListItem>
        <DataListItem label="Alasan" fullWidth>
          Kontrol gigi
        </DataListItem>
      </DataList>,
    );
    expect(container.querySelector("dl")).toHaveClass("grid", "lg:grid-cols-3");
    expect(screen.getByText("Kontrol gigi").closest("dl > div")).toHaveClass("sm:col-span-full");
  });

  it("spans a card edge to edge when inline", () => {
    const { container } = render(
      <Card>
        <DataList>
          <DataListItem label="NIS">1</DataListItem>
        </DataList>
      </Card>,
    );
    expect(container.querySelector("dl")).toHaveAttribute("data-card-flush");
  });
});

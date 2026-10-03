import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { DataTableFilters, type DataTableFilterDef } from "./data-table-filters.js";

/** A fixed "today" so the story's presets are stable across renders. */
const STORY_TODAY = new Date("2026-09-15T00:00:00Z");

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  const date = new Date(STORY_TODAY);
  date.setDate(date.getDate() - days);
  return isoDate(date);
}

function DataTableFiltersDemo() {
  const [materialType, setMaterialType] = useState("");
  const [classification, setClassification] = useState("");
  const [availability, setAvailability] = useState("");
  const [sort, setSort] = useState("");
  const [recordedFrom, setRecordedFrom] = useState("");
  const [recordedTo, setRecordedTo] = useState("");

  const filters: DataTableFilterDef[] = [
    {
      id: "materialType",
      label: "Jenis bahan",
      value: materialType,
      onChange: setMaterialType,
      options: [
        { value: "book", label: "Buku" },
        { value: "magazine", label: "Majalah" },
        { value: "reference", label: "Referensi" },
      ],
    },
    {
      id: "classification",
      label: "Klasifikasi",
      value: classification,
      onChange: setClassification,
      options: [
        { value: "000", label: "000 - Karya Umum" },
        { value: "800", label: "800 - Kesusastraan" },
      ],
    },
    {
      id: "availability",
      label: "Hanya tersedia",
      value: availability,
      onChange: setAvailability,
      type: "boolean",
      activeValue: "available",
    },
    {
      id: "sort",
      label: "Urutkan",
      value: sort,
      onChange: setSort,
      options: [
        { value: "", label: "Judul A-Z" },
        { value: "newest", label: "Terbaru" },
      ],
    },
    {
      id: "recordedAt",
      label: "Tanggal tercatat",
      type: "dateRange",
      from: recordedFrom,
      to: recordedTo,
      onChangeRange: ({ from, to }) => {
        setRecordedFrom(from);
        setRecordedTo(to);
      },
      // Presets are always computed by the caller -- here a fixed "today"
      // for a stable story, but apps/web derives this from the business
      // clock so a simulated date still lines up.
      presets: [
        { label: "Hari ini", from: isoDate(STORY_TODAY), to: isoDate(STORY_TODAY) },
        { label: "7 hari terakhir", from: daysAgo(6), to: isoDate(STORY_TODAY) },
        {
          label: "Bulan ini",
          from: isoDate(new Date(STORY_TODAY.getFullYear(), STORY_TODAY.getMonth(), 1)),
          to: isoDate(STORY_TODAY),
        },
      ],
    },
  ];

  return <DataTableFilters filters={filters} />;
}

const meta: Meta<typeof DataTableFiltersDemo> = {
  title: "Components/DataTableFilters",
  component: DataTableFiltersDemo,
};
export default meta;
type Story = StoryObj<typeof DataTableFiltersDemo>;

export const Default: Story = {};

export const WithActiveFilters: Story = {
  render: () => (
    <DataTableFilters
      filters={[
        {
          id: "materialType",
          label: "Jenis bahan",
          value: "book",
          onChange: () => undefined,
          options: [{ value: "book", label: "Buku" }],
        },
        {
          id: "availability",
          label: "Hanya tersedia",
          value: "available",
          onChange: () => undefined,
          type: "boolean",
          activeValue: "available",
        },
        {
          id: "recordedAt",
          label: "Tanggal tercatat",
          type: "dateRange",
          from: "2026-09-01",
          to: "2026-09-15",
          onChangeRange: () => undefined,
          presets: [
            { label: "Hari ini", from: "2026-09-15", to: "2026-09-15" },
            { label: "7 hari terakhir", from: "2026-09-09", to: "2026-09-15" },
          ],
        },
      ]}
    />
  ),
};

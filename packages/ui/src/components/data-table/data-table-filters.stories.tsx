import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { DataTableFilters, type DataTableFilterDef } from "./data-table-filters.js";

function DataTableFiltersDemo() {
  const [materialType, setMaterialType] = useState("");
  const [classification, setClassification] = useState("");
  const [availability, setAvailability] = useState("");
  const [sort, setSort] = useState("");

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
      ]}
    />
  ),
};

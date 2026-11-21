import type { Meta, StoryObj } from "@storybook/react";
import { useState, type ReactNode } from "react";

import { FilterBar } from "./filter-bar.js";
import { SearchInput } from "./search-input.js";
import { SegmentedControl } from "./segmented-control.js";
import { Select } from "./select.js";

function Board() {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  return (
    <FilterBar
      rowFrom="2xl"
      search={
        <SearchInput
          aria-label="Cari nama atau instansi"
          placeholder="Cari nama atau instansi"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      }
    >
      <SegmentedControl
        aria-label="Tampilkan"
        className="ml-auto"
        value={status}
        onValueChange={setStatus}
        options={[
          { value: "all", label: "Semua" },
          { value: "onSite", label: "Di sekolah", count: 8 },
          { value: "expected", label: "Terjadwal", count: 0 },
        ]}
      />
    </FilterBar>
  );
}

function Queue() {
  const [kind, setKind] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  return (
    <FilterBar search={<SearchInput size="sm" aria-label="Cari siswa" placeholder="Cari siswa" />}>
      <Select
        aria-label="Kelas"
        className="w-48"
        value={classFilter}
        onValueChange={setClassFilter}
        options={[
          { value: "all", label: "Semua kelas" },
          { value: "x-1", label: "X-1" },
        ]}
      />
      <SegmentedControl
        size="sm"
        aria-label="Jenis"
        value={kind}
        onValueChange={setKind}
        options={[
          { value: "all", label: "Semua" },
          { value: "leave", label: "Izin", count: 3 },
          { value: "exit", label: "Keluar", count: 1 },
          { value: "late", label: "Terlambat", count: 2 },
        ]}
      />
    </FilterBar>
  );
}

/**
 * The same bars in the columns a phone (358px), a 768px tablet beside the
 * sidebar (480px) and a laptop (736px) leave them: stacked at full width,
 * then one row, by the bar's own width.
 */
function Widths({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      {["w-[358px]", "w-[480px]", "w-[736px]"].map((width) => (
        <div key={width} className={`${width} max-w-full rounded-md border border-line p-3`}>
          {children}
        </div>
      ))}
    </div>
  );
}

const meta: Meta<typeof FilterBar> = {
  title: "Components/FilterBar",
  component: FilterBar,
};
export default meta;
type Story = StoryObj<typeof FilterBar>;

export const SearchAndStrip: Story = {
  render: () => (
    <Widths>
      <Board />
    </Widths>
  ),
};
export const SearchSelectAndStrip: Story = {
  render: () => (
    <Widths>
      <Queue />
    </Widths>
  ),
};
export const Dark: Story = {
  globals: { theme: "dark" },
  render: () => (
    <Widths>
      <Board />
    </Widths>
  ),
};

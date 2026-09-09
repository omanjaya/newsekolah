import type { Meta, StoryObj } from "@storybook/react";
import type {
  ColumnDef,
  PaginationState,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import { useState } from "react";

import { Button } from "../button.js";
import { EmptyState } from "../empty-state.js";
import { StatusBadge } from "../status-badge.js";

import { DataTable, selectionColumn } from "./data-table.js";

interface StudentRow {
  id: string;
  name: string;
  className: string;
  status: "present" | "sick" | "excused" | "dispensation" | "absent" | "late";
}

const ALL_ROWS: StudentRow[] = [
  { id: "1", name: "Siti Aminah", className: "X-1", status: "present" },
  { id: "2", name: "Budi Santoso", className: "X-1", status: "late" },
  { id: "3", name: "Andi Wijaya", className: "X-1", status: "absent" },
  { id: "4", name: "Dewi Lestari", className: "X-1", status: "sick" },
];

const columns: ColumnDef<StudentRow>[] = [
  selectionColumn<StudentRow>(),
  { accessorKey: "name", header: "Nama" },
  { accessorKey: "className", header: "Kelas" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

function DataTableDemo({ isLoading, empty }: { isLoading?: boolean; empty?: boolean }) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  return (
    <div className="w-[640px]">
      <DataTable
        data={empty ? [] : ALL_ROWS}
        columns={columns}
        rowCount={empty ? 0 : ALL_ROWS.length}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={setSorting}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        isLoading={isLoading}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        bulkActions={<Button size="sm">Kirim notifikasi</Button>}
        storageKey="stories.data-table.students"
        emptyState={
          <EmptyState
            title="Belum ada siswa di kelas ini"
            description="Tambahkan siswa lewat menu Kelas dan Siswa."
            action={<Button size="sm">Tambah siswa</Button>}
          />
        }
      />
    </div>
  );
}

const meta: Meta<typeof DataTableDemo> = {
  title: "Components/DataTable",
  component: DataTableDemo,
};
export default meta;
type Story = StoryObj<typeof DataTableDemo>;

export const Default: Story = {};
export const Loading: Story = { args: { isLoading: true } };
export const Empty: Story = { args: { empty: true } };

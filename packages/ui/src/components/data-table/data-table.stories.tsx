import type { Decorator, Meta, StoryObj } from "@storybook/react";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { Pencil, Plus, Trash2, Upload, Users } from "lucide-react";
import { useState } from "react";

import { Avatar } from "../avatar.js";
import { Badge } from "../badge.js";
import { Button } from "../button.js";
import { EmptyState } from "../empty-state.js";
import { RowActionsMenu } from "../row-actions-menu.js";

import type { DataTableFilterDef } from "./data-table-filters.js";
import { DataTable, selectionColumn } from "./data-table.js";

/**
 * DataTable in the states a list screen goes through: rows with filters
 * and the table's own actions, loading, empty, a failed load, cursor
 * paging, a selection with bulk actions. On a phone the same columns
 * become cards whose title, subtitle and meta come from `meta.card`.
 */
interface UserRow {
  id: string;
  name: string;
  username: string;
  kind: "Guru" | "Pegawai" | "Siswa";
  role: string;
  active: boolean;
}

const NAMES = [
  "Admin Contoh",
  "Guru Contoh",
  "Guru BK Contoh",
  "Kepala Sekolah Contoh",
  "Guru Piket Contoh",
  "Satpam Contoh",
  "Wakil Kepala Sekolah Contoh",
  "Pustakawan Contoh",
  "Nadia Putri Lestari",
  "Budi Santoso",
  "Rina Kartika",
  "Andi Wijaya",
];
const ROLES = ["Admin Sekolah", "Guru", "Guru BK", "Kepala Sekolah", "Pegawai", "Pustakawan"];
const KINDS: UserRow["kind"][] = ["Pegawai", "Guru", "Siswa"];

const USERS: UserRow[] = Array.from({ length: 24 }, (_, index) => {
  const name = NAMES[index % NAMES.length] ?? "Pengguna";
  return {
    id: String(index + 1),
    name: index < NAMES.length ? name : `${name} ${Math.floor(index / NAMES.length) + 1}`,
    username: `${name.toLowerCase().split(" ")[0] ?? "pengguna"}${String(index + 1)}`,
    kind: KINDS[index % KINDS.length] ?? "Guru",
    role: ROLES[index % ROLES.length] ?? "Guru",
    active: index % 7 !== 3,
  };
});

const columns: ColumnDef<UserRow>[] = [
  {
    accessorKey: "name",
    header: "Nama",
    meta: { card: "title", skeleton: "avatar" },
    cell: ({ row }) => (
      <span className="flex items-center gap-3">
        <Avatar name={row.original.name} size="md" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{row.original.name}</span>
          <span className="truncate text-caption font-normal text-fg-muted">
            {row.original.username}
          </span>
        </span>
      </span>
    ),
  },
  { accessorKey: "kind", header: "Jenis", meta: { card: "field" } },
  {
    accessorKey: "role",
    header: "Peran",
    meta: { card: "meta", skeleton: "badge" },
    cell: ({ row }) => <Badge variant="accent">{row.original.role}</Badge>,
  },
  {
    accessorKey: "active",
    header: "Status",
    meta: { card: "meta", skeleton: "badge" },
    cell: ({ row }) =>
      row.original.active ? (
        <Badge variant="success">Aktif</Badge>
      ) : (
        <Badge variant="neutral">Diarsipkan</Badge>
      ),
  },
  {
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: ({ row }) => (
      <RowActionsMenu
        ariaLabel={`Aksi untuk ${row.original.name}`}
        items={[
          { label: "Ubah", icon: <Pencil />, onClick: () => undefined },
          { label: "Arsipkan", icon: <Trash2 />, onClick: () => undefined, tone: "danger" },
        ]}
      />
    ),
  },
];

/**
 * The same table with every column but the name left as a labelled field
 * on the phone card, as a screen that sets no `meta.card` gets it: the
 * roles cell brings its own wrapping row of badges, which the card still
 * lines up on the right with the plain-text values.
 */
const fieldColumns: ColumnDef<UserRow>[] = columns.map((column) => {
  if (!("accessorKey" in column) || column.accessorKey === "name") return column;
  if (column.accessorKey === "role") {
    return {
      ...column,
      meta: { skeleton: "badge" },
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant="accent">{row.original.role}</Badge>
        </div>
      ),
    };
  }
  return { ...column, meta: column.accessorKey === "active" ? { skeleton: "badge" } : {} };
});

type Scenario =
  "rows" | "loading" | "empty" | "error" | "stale" | "cursor" | "selection" | "no-empty-state";

function useFilters(): [DataTableFilterDef[], (rows: UserRow[]) => UserRow[]] {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [archived, setArchived] = useState("");
  const filters: DataTableFilterDef[] = [
    {
      id: "kind",
      label: "Jenis",
      value: kind,
      onChange: setKind,
      options: KINDS.map((value) => ({ value, label: value })),
    },
    {
      id: "status",
      label: "Status",
      value: status,
      onChange: setStatus,
      options: [
        { value: "active", label: "Aktif" },
        { value: "archived", label: "Diarsipkan" },
      ],
    },
    { id: "role", label: "Peran", value: "", onChange: () => undefined, options: [] },
    {
      id: "archived",
      label: "Tampilkan yang diarsipkan",
      type: "boolean",
      value: archived,
      onChange: setArchived,
    },
  ];
  const apply = (rows: UserRow[]) =>
    rows.filter(
      (row) =>
        (kind === "" || row.kind === kind) &&
        (status === "" || (status === "active") === row.active),
    );
  return [filters, apply];
}

function DataTableDemo({
  scenario = "rows",
  cardFields = false,
}: {
  scenario?: Scenario;
  /** Uses `fieldColumns`: no `meta.card`, so the phone card lists labelled fields. */
  cardFields?: boolean;
}) {
  const tableColumns = cardFields ? fieldColumns : columns;
  const [filters, apply] = useFilters();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(
    scenario === "selection" ? { "1": true, "2": true } : {},
  );
  const [page, setPage] = useState(2);
  const emptyState = (
    <EmptyState
      icon={<Users />}
      title="Belum ada pengguna"
      description="Tambahkan pengguna satu per satu atau impor dari berkas."
      action={
        <Button size="sm" icon={<Plus />}>
          Tambah pengguna
        </Button>
      }
    />
  );
  const actions = (
    <>
      <Button variant="secondary" size="sm" icon={<Upload />} className="max-md:hidden">
        Impor
      </Button>
      <Button size="sm" icon={<Plus />}>
        Tambah
      </Button>
    </>
  );

  if (scenario === "cursor") {
    return (
      <DataTable
        mode="cursor"
        data={USERS.slice(10, 20)}
        columns={tableColumns}
        getRowId={(row) => row.id}
        emptyState={emptyState}
        cursorPagination={{
          hasPrevious: page > 1,
          hasNext: page < 3,
          onPrevious: () => {
            setPage((current) => current - 1);
          },
          onNext: () => {
            setPage((current) => current + 1);
          },
          page,
          pageSize: 10,
        }}
      />
    );
  }

  return (
    <DataTable
      mode="local"
      data={
        scenario === "empty" || scenario === "error" || scenario === "no-empty-state"
          ? []
          : apply(USERS)
      }
      columns={
        scenario === "selection" ? [selectionColumn<UserRow>(), ...tableColumns] : tableColumns
      }
      getRowId={(row) => row.id}
      defaultPageSize={10}
      isLoading={scenario === "loading"}
      error={
        scenario === "error" || scenario === "stale"
          ? Object.assign(new Error("fetch failed"), { code: "NETWORK" })
          : null
      }
      onRetry={() => undefined}
      filters={filters}
      toolbarActions={actions}
      rowSelection={rowSelection}
      onRowSelectionChange={scenario === "selection" ? setRowSelection : undefined}
      bulkActions={
        <Button size="sm" variant="secondary">
          Arsipkan
        </Button>
      }
      onRowActivate={() => undefined}
      emptyState={scenario === "no-empty-state" ? undefined : emptyState}
    />
  );
}

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

const meta: Meta<typeof DataTableDemo> = {
  title: "Components/DataTable",
  component: DataTableDemo,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-5xl">
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DataTableDemo>;

export const Default: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const Phone: Story = { parameters: { layout: "fullscreen" }, decorators: [phoneFrame] };
/** No `meta.card`: every column but the name is a labelled field, values on the right. */
export const PhoneFields: Story = {
  args: { cardFields: true },
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
};
export const Loading: Story = { args: { scenario: "loading" } };
/** The placeholder cards take the loaded cards' shape and height. */
export const LoadingPhone: Story = {
  args: { scenario: "loading" },
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
};
export const Empty: Story = { args: { scenario: "empty" } };
export const LoadFailed: Story = { args: { scenario: "error" } };
/** A failed refetch with rows still loaded: the rows stay under an alert. */
export const RefreshFailed: Story = { args: { scenario: "stale" } };
/** No `emptyState` from the screen: the table's own default. */
export const DefaultEmpty: Story = { args: { scenario: "no-empty-state" } };
export const CursorPaging: Story = { args: { scenario: "cursor" } };
export const Selection: Story = { args: { scenario: "selection" } };

import type { Meta, StoryObj } from "@storybook/react";
import { BookCopy, Pencil, Printer, Trash2 } from "lucide-react";

import { RowActionsMenu } from "./row-actions-menu.js";

const ITEMS = [
  { label: "Ubah", icon: <Pencil />, onClick: () => undefined },
  { label: "Cetak label", icon: <Printer />, onClick: () => undefined },
  { label: "Tambah eksemplar", icon: <BookCopy />, onClick: () => undefined, disabled: true },
  { label: "Hapus", icon: <Trash2 />, onClick: () => undefined, tone: "danger" as const },
];

function Row() {
  return (
    <div className="flex min-h-80 w-96 max-w-full items-start p-4">
      <div className="flex w-full items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex flex-col">
          <span className="text-label text-fg">Laskar Pelangi</span>
          <span className="text-body-sm text-fg-muted">Andrea Hirata, 3 eksemplar</span>
        </div>
        <RowActionsMenu ariaLabel="Aksi untuk Laskar Pelangi" items={ITEMS} />
      </div>
    </div>
  );
}

const meta: Meta<typeof RowActionsMenu> = {
  title: "Components/RowActionsMenu",
  component: RowActionsMenu,
};
export default meta;
type Story = StoryObj<typeof RowActionsMenu>;

/** Click the dots to open; arrow keys move, Escape closes. */
export const Default: Story = { render: () => <Row /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Row /> };

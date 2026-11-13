import type { Decorator, Meta, StoryObj } from "@storybook/react";

import { SemanticStatusBadge, type SemanticStatus } from "./semantic-status.js";
import { StatusBadge, type StatusName } from "./status-badge.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

const meta: Meta<typeof StatusBadge> = {
  title: "Components/StatusBadge",
  component: StatusBadge,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof StatusBadge>;

const ATTENDANCE: StatusName[] = ["present", "sick", "excused", "dispensation", "absent", "late"];
const SEMANTIC: { status: SemanticStatus; label: string }[] = [
  { status: "pending", label: "Menunggu" },
  { status: "in_progress", label: "Berjalan" },
  { status: "approved", label: "Disetujui" },
  { status: "completed", label: "Selesai" },
  { status: "partial", label: "Dibayar sebagian" },
  { status: "rejected", label: "Ditolak" },
  { status: "overdue", label: "Terlambat" },
  { status: "draft", label: "Draf" },
  { status: "cancelled", label: "Dibatalkan" },
  { status: "inactive", label: "Nonaktif" },
];

/** Both families side by side in one status column: the same pill shape throughout. */
function Gallery() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-caption text-fg-muted">Presensi (StatusBadge)</p>
        <div className="flex flex-wrap gap-2">
          {ATTENDANCE.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {ATTENDANCE.map((status) => (
            <StatusBadge key={status} status={status} size="sm" appearance="outline" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-caption text-fg-muted">Alur kerja (SemanticStatusBadge)</p>
        <div className="flex flex-wrap gap-2">
          {SEMANTIC.map(({ status, label }) => (
            <SemanticStatusBadge key={status} status={status} label={label} />
          ))}
        </div>
      </div>
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-surface shadow-1">
        {SEMANTIC.slice(0, 5).map(({ status, label }, index) => (
          <div
            key={status}
            className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
          >
            <span className="text-body text-fg">Izin keluar #{index + 41}</span>
            <SemanticStatusBadge status={status} label={label} />
          </div>
        ))}
      </div>
    </div>
  );
}

export const Default: Story = { render: () => <Gallery /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Gallery />,
};

import type { Meta, StoryObj } from "@storybook/react";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table.js";

const meta: Meta<typeof Table> = {
  title: "Components/Table",
  component: Table,
};
export default meta;
type Story = StoryObj<typeof Table>;

const rows = [
  { id: "1", title: "Matematika untuk SD", author: "Ratna Sari", copies: 12 },
  { id: "2", title: "Sejarah Indonesia", author: "Budi Santoso", copies: 5 },
  { id: "3", title: "Belajar Bahasa Inggris", author: "Dewi Lestari", copies: 8 },
];

export const Normal: Story = {
  render: () => (
    <Table>
      <TableCaption>Koleksi terbaru perpustakaan</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Judul</TableHead>
          <TableHead>Penulis</TableHead>
          <TableHead className="text-right tabular-nums">Eksemplar</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.title}</TableCell>
            <TableCell>{row.author}</TableCell>
            <TableCell className="text-right tabular-nums">{row.copies}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

export const Compact: Story = {
  render: () => (
    <Table density="compact">
      <TableHeader>
        <TableRow>
          <TableHead>Judul</TableHead>
          <TableHead>Penulis</TableHead>
          <TableHead className="text-right tabular-nums">Eksemplar</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.title}</TableCell>
            <TableCell>{row.author}</TableCell>
            <TableCell className="text-right tabular-nums">{row.copies}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

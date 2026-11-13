import type { Meta, StoryObj } from "@storybook/react";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
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
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>Jumlah</TableCell>
          <TableCell className="text-right tabular-nums">25</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};

export const Dark: Story = { ...Normal, globals: { theme: "dark" } };
export const Phone: Story = {
  ...Normal,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="mx-auto w-[390px] max-w-full p-4">
        <Story />
      </div>
    ),
  ],
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

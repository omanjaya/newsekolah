import type { Meta, StoryObj } from "@storybook/react";

import { Card } from "./card.js";
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

const students = [
  { id: "s1", name: "Ahmad Fauzan Ramadhan Saputra", scores: [86, 90, 78] },
  { id: "s2", name: "Siti Nurhaliza", scores: [92, 88, 95] },
  { id: "s3", name: "Budi Santoso", scores: [74, 80, 70] },
];
const gradeComponents = [
  { code: "UH1", weight: 30 },
  { code: "UTS", weight: 30 },
  { code: "UAS", weight: 40 },
];

/**
 * A grade sheet: each student's name heads its row (`scope="row"`, the
 * cell's padding, wrapping), and the column headers carry two lines.
 */
export const RowHeaders: Story = {
  render: () => (
    <Table density="compact" containerClassName="w-[36rem] max-w-full">
      <TableHeader>
        <TableRow>
          <TableHead className="w-48">Siswa</TableHead>
          {gradeComponents.map((component) => (
            <TableHead key={component.code} className="text-right align-top">
              <span className="flex flex-col items-end gap-0.5">
                <span className="text-fg">{component.code}</span>
                <span className="font-normal">Bobot {component.weight}%</span>
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student) => (
          <TableRow key={student.id} data-state={student.id === "s2" ? "selected" : undefined}>
            <TableHead>{student.name}</TableHead>
            {student.scores.map((score, index) => (
              <TableCell key={gradeComponents[index]?.code} className="text-right tabular-nums">
                {score}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableHead>Rata-rata</TableHead>
          <TableCell className="text-right tabular-nums">84</TableCell>
          <TableCell className="text-right tabular-nums">86</TableCell>
          <TableCell className="text-right tabular-nums">81</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};
export const RowHeadersDark: Story = { ...RowHeaders, globals: { theme: "dark" } };
/** At 390px the grade sheet keeps its columns and scrolls sideways inside its card. */
export const RowHeadersPhone: Story = {
  render: () => (
    <Table density="compact" className="min-w-[32rem]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">Siswa</TableHead>
          {gradeComponents.map((component) => (
            <TableHead key={component.code} className="text-right align-top">
              <span className="flex flex-col items-end gap-0.5">
                <span className="text-fg">{component.code}</span>
                <span className="font-normal">Bobot {component.weight}%</span>
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student) => (
          <TableRow key={student.id}>
            <TableHead>{student.name}</TableHead>
            {student.scores.map((score, index) => (
              <TableCell key={gradeComponents[index]?.code} className="text-right tabular-nums">
                {score}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
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

/** A grid that sits in its own Card and scroll area: the bare table, day headings sticking to the top. */
export const Unframed: Story = {
  render: () => (
    <Card className="max-h-64 overflow-auto p-0">
      <Table framed={false} density="compact" className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky top-0 bg-surface">Jam</TableHead>
            <TableHead className="sticky top-0 bg-surface">Senin</TableHead>
            <TableHead className="sticky top-0 bg-surface">Selasa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }, (_, index) => (
            <TableRow key={index}>
              <TableCell>{`Jam ${String(index + 1)}`}</TableCell>
              <TableCell>Matematika</TableCell>
              <TableCell>Biologi</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  ),
};

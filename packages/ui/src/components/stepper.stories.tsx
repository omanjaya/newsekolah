import type { Decorator, Meta, StoryObj } from "@storybook/react";

import { Stepper, type StepperStep } from "./stepper.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

/** An exit permit halfway through: who acted, when, and who it waits on. */
const EXIT_PERMIT: StepperStep[] = [
  { id: "submitted", label: "Diajukan", actor: "Nadia Putri", time: "25 Sep 08.02" },
  { id: "homeroom", label: "Wali kelas", actor: "Disetujui Bu Rina", time: "08.14" },
  {
    id: "duty",
    label: "Guru piket",
    actor: "Menunggu guru piket",
    time: "sejak 12 menit lalu",
  },
  { id: "gate", label: "Gerbang", description: "Tunjukkan QR ke satpam" },
];

const STOPPED: StepperStep[] = [
  { id: "submitted", label: "Diajukan", actor: "Raka Pratama", time: "24 Sep 10.40" },
  {
    id: "homeroom",
    label: "Wali kelas",
    state: "stopped",
    actor: "Ditolak Pak Adi",
    time: "10.52",
  },
  { id: "duty", label: "Guru piket", state: "upcoming" },
  { id: "gate", label: "Gerbang", state: "upcoming" },
];

const IMPORT = [
  { id: "upload", label: "Unggah" },
  { id: "mapping", label: "Pemetaan kolom" },
  { id: "preview", label: "Pratinjau" },
  { id: "done", label: "Selesai" },
];

function Gallery() {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h3 className="text-heading text-fg">Alur izin keluar (aktor dan waktu)</h3>
        <Stepper steps={EXIT_PERMIT} currentIndex={2} />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-heading text-fg">Dihentikan</h3>
        <Stepper steps={STOPPED} currentIndex={1} />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-heading text-fg">Ringkas (wizard impor)</h3>
        <Stepper steps={IMPORT} currentIndex={1} variant="compact" />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-heading text-fg">Vertikal</h3>
        <Stepper steps={EXIT_PERMIT} currentIndex={2} orientation="vertical" />
      </section>
    </div>
  );
}

const meta: Meta<typeof Stepper> = {
  title: "Components/Stepper",
  component: Stepper,
};
export default meta;
type Story = StoryObj<typeof Stepper>;

export const Variants: Story = { render: () => <Gallery /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Gallery />,
};

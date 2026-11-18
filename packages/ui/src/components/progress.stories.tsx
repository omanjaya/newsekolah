import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";

import { Progress } from "./progress.js";

const phoneFrame: Decorator = (Story) => (
  <div className="mx-auto w-[390px] max-w-full p-4">
    <Story />
  </div>
);

/** An upload that keeps moving, to see the 320ms meter motion between values. */
function Uploading() {
  const [value, setValue] = useState(18);
  useEffect(() => {
    const timer = setInterval(() => {
      setValue((current) => (current >= 100 ? 12 : Math.min(100, current + 17)));
    }, 1200);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return <Progress value={value} label="Mengunggah daftar siswa" />;
}

function Gallery() {
  return (
    <div className="flex w-96 max-w-full flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h3 className="text-heading text-fg">Bar</h3>
        <Progress value={64} label="Mengimpor 412 dari 640 baris" />
        <Uploading />
      </section>
      <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5">
        <h3 className="text-heading text-fg">Meter</h3>
        <Progress variant="meter" value={96} label="Kehadiran" tone="success" />
        <Progress
          variant="meter"
          value={68}
          max={100}
          label="Matematika (KKM 75)"
          valueLabel="68 / 100"
          tone="warning"
        />
        <Progress variant="meter" value={2} max={3} label="Buku dipinjam" valueLabel="2 dari 3" />
        <Progress variant="meter" value={12} label="Sisa kuota SP" tone="danger" />
      </section>
      <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5">
        <h3 className="text-heading text-fg">Penanda ambang</h3>
        <Progress
          variant="meter"
          value={68}
          label="KKTP 75"
          valueLabel="Kurang 7"
          tone="warning"
          markers={[{ value: 75 }]}
        />
        <Progress
          value={40}
          max={100}
          tone="warning"
          aria-label="40 poin terhadap ambang surat peringatan"
          valueLabel="40 poin"
          markers={[
            { value: 25, label: "SP 1" },
            { value: 50, label: "SP 2" },
            { value: 100, label: "SP 3" },
          ]}
        />
      </section>
    </div>
  );
}

const meta: Meta<typeof Progress> = {
  title: "Components/Progress",
  component: Progress,
};
export default meta;
type Story = StoryObj<typeof Progress>;

export const Variants: Story = { render: () => <Gallery /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneFrame],
  render: () => <Gallery />,
};

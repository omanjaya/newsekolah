import type { Meta, StoryObj } from "@storybook/react";

import { phoneViewport } from "../stories/phone-viewport.js";

import { AvatarGroup } from "./avatar-group.js";
import { Avatar, type AvatarPixelSize } from "./avatar.js";

const meta: Meta<typeof Avatar> = {
  title: "Components/Avatar",
  component: Avatar,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Avatar>;

const SIZES: AvatarPixelSize[] = [24, 32, 40, 44, 48, 64];
const PEOPLE = [
  "Nadia Putri",
  "Rina Wulandari",
  "Budi Santoso",
  "Agus Pratama",
  "Sari Dewi",
  "Made Ari",
];
// A data URI keeps the story offline; a soft gradient stands in for a photo.
const PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fb9a8"/><stop offset="1" stop-color="#3f6f5d"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="32" cy="26" r="11" fill="#e9efe9"/><path d="M12 60c3-12 12-18 20-18s17 6 20 18" fill="#e9efe9"/></svg>',
  );

function Gallery() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-4">
        {SIZES.map((size) => (
          <div key={size} className="flex flex-col items-center gap-2">
            <Avatar name="Nadia Putri" size={size} tone="accent" />
            <span className="text-caption text-fg-muted">{size}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {PEOPLE.map((name) => (
          <Avatar key={name} name={name} size={40} />
        ))}
        <Avatar name="Foto Siswa" src={PHOTO} size={40} />
        <Avatar name="Foto Siswa" src={PHOTO} size={64} />
      </div>
      <div className="flex flex-col gap-4">
        <AvatarGroup size={32} aria-label="Pengajar kelas X-A">
          {PEOPLE.slice(0, 4).map((name) => (
            <Avatar key={name} name={name} />
          ))}
        </AvatarGroup>
        <AvatarGroup size={40} max={4} aria-label="Anggota ekstrakurikuler">
          {PEOPLE.map((name) => (
            <Avatar key={name} name={name} />
          ))}
        </AvatarGroup>
        <AvatarGroup size={24} max={3} aria-label="Peninjau">
          {PEOPLE.map((name) => (
            <Avatar key={name} name={name} />
          ))}
        </AvatarGroup>
      </div>
      {/* The widest initials at the smallest size, and the size a person takes in a table row. */}
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          {["Made Wirawan", "Wayan Made", "Guru BK Contoh", "Siswa Dua Contoh"].map((name) => (
            <Avatar key={name} name={name} size={24} />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Avatar name="Guru BK Contoh" size={32} decorative />
          <div className="flex flex-col">
            <span className="text-body text-fg">Guru BK Contoh</span>
            <span className="text-caption text-fg-muted">gurubk</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Default: Story = { render: () => <Gallery /> };
export const Dark: Story = { globals: { theme: "dark" }, render: () => <Gallery /> };
export const Phone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [phoneViewport],
  render: () => <Gallery />,
};

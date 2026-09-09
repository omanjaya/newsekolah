import type { Meta, StoryObj } from "@storybook/react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs.js";

function TabsDemo() {
  return (
    <Tabs defaultValue="summary" className="w-80">
      <TabsList>
        <TabsTrigger value="summary">Ringkasan</TabsTrigger>
        <TabsTrigger value="history">Riwayat</TabsTrigger>
        <TabsTrigger value="documents">Dokumen</TabsTrigger>
      </TabsList>
      <TabsContent value="summary">Ringkasan siswa.</TabsContent>
      <TabsContent value="history">Riwayat presensi dan izin.</TabsContent>
      <TabsContent value="documents">Surat dan dokumen terkait.</TabsContent>
    </Tabs>
  );
}

const meta: Meta<typeof TabsDemo> = {
  title: "Components/Tabs",
  component: TabsDemo,
};
export default meta;
type Story = StoryObj<typeof TabsDemo>;

export const Default: Story = {};

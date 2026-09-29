import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionSaveBar } from "./session-save-bar";

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) => (key: string, params?: Record<string, string | number>) => {
      if (namespace === "app.attendance.editor" && key === "saveSummary") {
        return `${params?.total} siswa · ${params?.changed} diubah dari hadir`;
      }
      if (key === "save") return "Simpan presensi";
      if (key === "saveCorrection") return "Simpan koreksi";
      if (key === "reasonPlaceholder") return "Alasan koreksi (wajib)";
      return key;
    },
}));

describe("SessionSaveBar", () => {
  it("shows the student total and how many changed from present", () => {
    render(
      <SessionSaveBar
        isCorrection={false}
        reason=""
        onReasonChange={() => undefined}
        studentTotal={32}
        changedFromDefaultCount={3}
        saving={false}
        formError={null}
        onSave={() => undefined}
      />,
    );
    expect(screen.getByText("32 siswa · 3 diubah dari hadir")).toBeInTheDocument();
  });

  it("still shows the required correction-reason field in correction mode", () => {
    render(
      <SessionSaveBar
        isCorrection={true}
        reason=""
        onReasonChange={() => undefined}
        studentTotal={32}
        changedFromDefaultCount={1}
        saving={false}
        formError={null}
        onSave={() => undefined}
      />,
    );
    expect(screen.getByLabelText("Alasan koreksi (wajib)")).toBeInTheDocument();
    expect(screen.getByText("32 siswa · 1 diubah dari hadir")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan koreksi" })).toBeInTheDocument();
  });
});

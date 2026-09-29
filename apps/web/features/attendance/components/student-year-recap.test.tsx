import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudentYearRecap } from "./student-year-recap";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (key === "recapSummary") return `Tahun ini: ${params?.summary}`;
    if (key === "recapAllClear") return "Tahun ini: tidak ada catatan.";
    return key;
  },
}));

const STATUSES = [
  { code: "H", label: "Hadir", color: "green", counts_as_present: true },
  { code: "S", label: "Sakit", color: "yellow", counts_as_present: false },
  { code: "I", label: "Izin", color: "blue", counts_as_present: false },
  { code: "D", label: "Dispensasi", color: "purple", counts_as_present: false },
  { code: "A", label: "Alpha", color: "red", counts_as_present: false },
];

describe("StudentYearRecap", () => {
  it("names only the non-zero statuses as readable text", () => {
    render(<StudentYearRecap statuses={STATUSES} yearCounts={{ S: 1, D: 3 }} />);
    expect(screen.getByText("Tahun ini: sakit 1, dispensasi 3")).toBeInTheDocument();
  });

  it("shows a neutral phrase when every count is zero", () => {
    render(<StudentYearRecap statuses={STATUSES} yearCounts={{ S: 0, I: 0, D: 0, A: 0 }} />);
    expect(screen.getByText("Tahun ini: tidak ada catatan.")).toBeInTheDocument();
  });

  it("renders nothing when yearCounts is missing (nothing recorded yet)", () => {
    const { container } = render(<StudentYearRecap statuses={STATUSES} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the policy has no exception statuses", () => {
    const { container } = render(
      <StudentYearRecap
        statuses={[{ code: "H", label: "Hadir", color: "green", counts_as_present: true }]}
        yearCounts={{ H: 5 }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

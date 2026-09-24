import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudentYearRecap } from "./student-year-recap";

const STATUSES = [
  { code: "H", label: "Hadir", color: "green", counts_as_present: true },
  { code: "S", label: "Sakit", color: "yellow", counts_as_present: false },
  { code: "I", label: "Izin", color: "blue", counts_as_present: false },
  { code: "D", label: "Dispensasi", color: "purple", counts_as_present: false },
  { code: "A", label: "Alpha", color: "red", counts_as_present: false },
];

describe("StudentYearRecap", () => {
  it("summarises every non-present status, including zero counts", () => {
    render(<StudentYearRecap statuses={STATUSES} yearCounts={{ S: 1, D: 3 }} />);
    expect(screen.getByLabelText("Sakit 1, Izin 0, Dispensasi 3, Alpha 0")).toBeInTheDocument();
  });

  it("renders nothing when yearCounts is missing (nothing recorded yet)", () => {
    const { container } = render(<StudentYearRecap statuses={STATUSES} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when every count is zero", () => {
    const { container } = render(
      <StudentYearRecap statuses={STATUSES} yearCounts={{ S: 0, I: 0, D: 0, A: 0 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the policy has no exception statuses", () => {
    const { container } = render(
      <StudentYearRecap
        statuses={[{ code: "H", label: "Hadir", color: "green", counts_as_present: true }]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

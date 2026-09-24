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

  it("treats a missing yearCounts as all zero", () => {
    render(<StudentYearRecap statuses={STATUSES} />);
    expect(screen.getByLabelText("Sakit 0, Izin 0, Dispensasi 0, Alpha 0")).toBeInTheDocument();
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

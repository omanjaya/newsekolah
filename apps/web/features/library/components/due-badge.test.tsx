import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DueBadge } from "./due-badge";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));

vi.mock("../lib/short-date", () => ({
  formatShortDay: (value: string) => value,
}));

describe("DueBadge", () => {
  it("names the days late and the due date of an overdue loan", () => {
    render(<DueBadge dueOn="2026-10-01" today="2026-10-11" locale="id" />);

    expect(screen.getByText(/^overdue /)).toHaveTextContent('"days":10');
    expect(screen.getByText(/^overdue /)).toHaveTextContent('"date":"2026-10-01"');
  });

  it("drops the due date when compact, for a narrow phone row", () => {
    render(<DueBadge dueOn="2026-10-01" today="2026-10-11" locale="id" compact />);

    const badge = screen.getByText(/^overdueShort /);
    expect(badge).toHaveTextContent('"days":10');
    expect(badge).not.toHaveTextContent("date");
  });

  // Due Friday 2 Oct, seen Monday 5 Oct: 3 calendar days, 1 working day.
  it("shows the server's working days late when given, as the return line does", () => {
    render(<DueBadge dueOn="2026-10-02" today="2026-10-05" locale="id" lateDays={1} compact />);

    const badge = screen.getByText(/^overdueWorkingShort /);
    expect(badge).toHaveTextContent('"days":1');
    expect(screen.queryByText(/^overdueShort /)).not.toBeInTheDocument();
  });

  it("keeps the due date in the full working-day label", () => {
    render(<DueBadge dueOn="2026-10-02" today="2026-10-05" locale="id" lateDays={1} />);

    const badge = screen.getByText(/^overdueWorking /);
    expect(badge).toHaveTextContent('"days":1');
    expect(badge).toHaveTextContent('"date":"2026-10-02"');
  });

  it("claims no days late for a loan past due only by closed days", () => {
    render(<DueBadge dueOn="2026-10-02" today="2026-10-04" locale="id" lateDays={0} compact />);

    expect(screen.getByText("pastDue")).toBeInTheDocument();
  });

  it("keeps the due date for a loan that is not late, compact or not", () => {
    render(<DueBadge dueOn="2026-10-20" today="2026-10-11" locale="id" compact />);

    expect(screen.getByText(/^dueOn /)).toHaveTextContent('"date":"2026-10-20"');
  });
});

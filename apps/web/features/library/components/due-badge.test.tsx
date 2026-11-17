import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DueBadge } from "./due-badge";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));

vi.mock("../lib/short-date", () => ({
  formatShortDate: (value: string) => value,
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

  it("keeps the due date for a loan that is not late, compact or not", () => {
    render(<DueBadge dueOn="2026-10-20" today="2026-10-11" locale="id" compact />);

    expect(screen.getByText(/^dueOn /)).toHaveTextContent('"date":"2026-10-20"');
  });
});

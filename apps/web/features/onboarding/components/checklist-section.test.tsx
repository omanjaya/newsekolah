import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChecklistSection } from "./checklist-section";

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: { count?: number }): string =>
      values?.count === undefined ? `${namespace}.${key}` : `${String(values.count)} ${key}`,
}));

afterEach(cleanup);

describe("ChecklistSection", () => {
  it("shows a step's count at the row's end, not inside its clamped description", () => {
    render(
      <ChecklistSection
        isLoading={false}
        checklist={{
          steps: [{ key: "classes", done: true, count: 6, required: true }],
          required_done: 1,
          required_total: 1,
          ready_to_operate: true,
        }}
      />,
    );
    const description = screen.getByText("app.onboarding.steps.classes.description");
    expect(description.textContent).toBe("app.onboarding.steps.classes.description");
    expect(screen.getByText("6 count")).toBeInTheDocument();
  });
});

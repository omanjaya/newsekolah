import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.hour ? `${key}:${values.hour}` : key,
  useFormatter: () => ({
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      value.toLocaleString("id", options),
    dateTime: (value: Date, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("id", options).format(value),
  }),
}));

import { LoginActivityChart } from "./login-activity-chart";

describe("LoginActivityChart", () => {
  // The rest of the app writes 13.00 for an hour; the chart must not hand-build 13:00.
  it("writes the peak hour in the locale's clock format", () => {
    const values = Array.from({ length: 24 }, (_, hour) => (hour === 13 ? 9 : 1));
    render(<LoginActivityChart values={values} />);

    expect(screen.getByText("peak:13.00")).toBeInTheDocument();
  });
});

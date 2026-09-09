import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type * as ThemeProviderModule from "../lib/theme/theme-provider";
import { useTheme } from "../lib/theme/theme-provider";

import { ThemeToggle } from "./theme-toggle";

const setTheme = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("../lib/theme/theme-provider", async () => {
  const actual = await vi.importActual<typeof ThemeProviderModule>("../lib/theme/theme-provider");
  return { ...actual, useTheme: vi.fn() };
});

const mockedUseTheme = vi.mocked(useTheme);

describe("ThemeToggle", () => {
  it("calls setTheme with the option the user picks", async () => {
    mockedUseTheme.mockReturnValue({ theme: "system", setTheme });
    const user = userEvent.setup();

    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "themeLabel" }));
    await user.click(await screen.findByText("themeDark"));

    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("marks the current theme as checked in the menu", async () => {
    mockedUseTheme.mockReturnValue({ theme: "light", setTheme });
    const user = userEvent.setup();

    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "themeLabel" }));

    expect(await screen.findByText("themeLight")).toBeInTheDocument();
  });
});

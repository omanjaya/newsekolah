import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type * as ThemeProviderModule from "../lib/theme/theme-provider";
import { useTheme } from "../lib/theme/theme-provider";

import { ThemeMenuSegments, ThemeSwitch } from "./theme-toggle";

const setTheme = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("../lib/theme/theme-provider", async () => {
  const actual = await vi.importActual<typeof ThemeProviderModule>("../lib/theme/theme-provider");
  return { ...actual, useTheme: vi.fn() };
});

const mockedUseTheme = vi.mocked(useTheme);

describe("ThemeSwitch", () => {
  it("calls setTheme with the option the user picks", async () => {
    mockedUseTheme.mockReturnValue({ theme: "system", setTheme });
    const user = userEvent.setup();

    render(<ThemeSwitch />);
    await user.click(screen.getByRole("radio", { name: "themeDark" }));

    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("marks the current theme as checked", () => {
    mockedUseTheme.mockReturnValue({ theme: "light", setTheme });

    render(<ThemeSwitch />);

    expect(screen.getByRole("radiogroup", { name: "theme" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "themeLight" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "themeDark" })).not.toBeChecked();
  });
});

describe("ThemeMenuSegments", () => {
  it("offers the three themes as menu radio items and keeps the menu open on a pick", async () => {
    mockedUseTheme.mockReturnValue({ theme: "light", setTheme });
    const user = userEvent.setup();

    render(
      <DropdownMenu>
        <DropdownMenuTrigger>open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <ThemeMenuSegments />
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole("button", { name: "open" }));

    const light = await screen.findByRole("menuitemradio", { name: "themeLight" });
    expect(light).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("menuitemradio", { name: "themeSystem" }));

    expect(setTheme).toHaveBeenCalledWith("system");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});

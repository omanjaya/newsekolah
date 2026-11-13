import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeskModeTabs } from "./desk-mode-tabs";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

describe("DeskModeTabs", () => {
  it("does not point any tab at a panel that is not rendered", () => {
    render(
      <DeskModeTabs
        mode="borrow"
        onModeChange={vi.fn()}
        pendingCounts={{ borrow: 0, return: 0, renew: 0 }}
      />,
    );

    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).not.toHaveAttribute("aria-controls");
    }
  });
});

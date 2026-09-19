import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Sheet, SheetContent } from "./sheet.js";

describe("Sheet", () => {
  it("uses a localized 44px close target and a scrollable body", () => {
    render(
      <Sheet open>
        <SheetContent title="Actions" closeLabel="Close sheet">
          <div>Body</div>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole("button", { name: "Close sheet" })).toHaveClass("min-h-11", "min-w-11");
    expect(screen.getByText("Body").parentElement).toHaveClass("overflow-y-auto");
  });
});

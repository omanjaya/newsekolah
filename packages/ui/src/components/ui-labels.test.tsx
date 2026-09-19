import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Dialog, DialogContent } from "./dialog.js";
import { Sheet, SheetContent } from "./sheet.js";
import { UiLabelsProvider } from "./ui-labels.js";

describe("UiLabelsProvider", () => {
  it("localizes shared dialog and sheet close controls", () => {
    render(
      <UiLabelsProvider labels={{ dialogClose: "Close dialog", sheetClose: "Close sheet" }}>
        <Dialog open>
          <DialogContent title="Dialog" />
        </Dialog>
        <Sheet open>
          <SheetContent title="Sheet" />
        </Sheet>
      </UiLabelsProvider>,
    );

    expect(screen.getByRole("button", { name: "Close dialog", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close sheet", hidden: true })).toBeInTheDocument();
  });

  it("keeps an explicit caller label ahead of provider defaults", () => {
    render(
      <UiLabelsProvider labels={{ dialogClose: "Provider close" }}>
        <Dialog open>
          <DialogContent title="Dialog" closeLabel="Caller close" />
        </Dialog>
      </UiLabelsProvider>,
    );

    expect(screen.getByRole("button", { name: "Caller close" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Provider close" })).not.toBeInTheDocument();
  });
});

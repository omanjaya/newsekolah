import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createBatch: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../use-library-error-message", () => ({
  useLibraryErrorMessage: () => () => "error",
}));
vi.mock("../api", () => ({
  useCreateLibraryCopiesBatchMutation: () => ({ mutate: mocks.createBatch, isPending: false }),
}));
vi.mock("../master-data-api", () => ({
  useLibraryCatalogueOptionsQuery: () => ({ data: undefined, isLoading: false }),
}));

import { CopiesBatchForm } from "./copies-batch-form";

beforeEach(() => {
  vi.clearAllMocks();
});

// Typing 0 and clicking "Tambahkan" created one copy, and 999 created 200:
// the click blurred the count field, which corrected the number to the
// range before the form's own check ran.
describe("CopiesBatchForm", () => {
  it.each(["0", "999"])(
    "refuses a count of %s on a click, without creating copies",
    async (typed) => {
      const user = userEvent.setup();
      render(<CopiesBatchForm titleId="title-1" onDone={vi.fn()} />);
      const count = screen.getByRole("spinbutton", { name: "count" });
      await user.clear(count);
      await user.type(count, typed);
      await user.click(screen.getByRole("button", { name: "save" }));

      expect(mocks.createBatch).not.toHaveBeenCalled();
      expect(count).toHaveValue(typed);
      expect(count).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("countRange")).toBeInTheDocument();
    },
  );

  it("refuses an out-of-range count submitted with Enter too", async () => {
    const user = userEvent.setup();
    render(<CopiesBatchForm titleId="title-1" onDone={vi.fn()} />);
    const count = screen.getByRole("spinbutton", { name: "count" });
    await user.clear(count);
    await user.type(count, "0{Enter}");
    expect(mocks.createBatch).not.toHaveBeenCalled();
    expect(screen.getByText("countRange")).toBeInTheDocument();
  });

  it("sends a count inside the range", async () => {
    const user = userEvent.setup();
    render(<CopiesBatchForm titleId="title-1" onDone={vi.fn()} />);
    const count = screen.getByRole("spinbutton", { name: "count" });
    await user.clear(count);
    await user.type(count, "12");
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(mocks.createBatch).toHaveBeenCalledWith(
      expect.objectContaining({ titleId: "title-1", count: 12 }),
      expect.any(Object),
    );
  });
});

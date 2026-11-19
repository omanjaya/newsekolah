import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { YearFormDialog } from "./year-form-dialog";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

afterEach(cleanup);

describe("YearFormDialog", () => {
  it("marks every missing field and focuses the first when Simpan is pressed empty", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <YearFormDialog target="new" onOpenChange={vi.fn()} onSubmit={onSubmit} pending={false} />,
    );

    await user.click(screen.getByRole("button", { name: "form.save" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("required")).toBeInTheDocument();
    expect(screen.getByText("form.periodRequired")).toBeInTheDocument();
    const name = screen.getByRole("textbox", { name: /form.label/ });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveFocus();
  });

  it("clears the name error once it is filled, keeping the period's", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <YearFormDialog target="new" onOpenChange={vi.fn()} onSubmit={onSubmit} pending={false} />,
    );

    await user.click(screen.getByRole("button", { name: "form.save" }));
    await user.type(screen.getByRole("textbox", { name: /form.label/ }), "2027/2028");

    expect(screen.queryByText("required")).not.toBeInTheDocument();
    expect(screen.getByText("form.periodRequired")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits an existing year unchanged", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <YearFormDialog
        target={{
          id: "y1",
          label: " 2026/2027 ",
          starts_on: "2026-07-13",
          ends_on: "2027-06-30",
          is_active: true,
        }}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "form.save" }));

    expect(onSubmit).toHaveBeenCalledWith({
      label: "2026/2027",
      starts_on: "2026-07-13",
      ends_on: "2027-06-30",
    });
  });
});

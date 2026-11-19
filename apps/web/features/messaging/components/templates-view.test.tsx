import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TemplatesView } from "./templates-view";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.name ? `${key}:${values.name}` : key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../api", () => ({
  useWhatsAppTemplatesQuery: () => ({
    isLoading: false,
    data: {
      data: [
        {
          id: "t1",
          name: "Tagihan jatuh tempo",
          locale: "id",
          meta_template_name: "bill_due",
          body: "Halo",
        },
      ],
    },
  }),
  useCreateWhatsAppTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateWhatsAppTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteWhatsAppTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviewWhatsAppTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

describe("TemplatesView", () => {
  it("labels the row action as edit, not save", () => {
    render(<TemplatesView />);
    expect(screen.getByRole("button", { name: "form.edit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "form.save" })).not.toBeInTheDocument();
  });

  it("names the template in the delete confirmation", async () => {
    const user = userEvent.setup();
    render(<TemplatesView />);
    await user.click(screen.getByRole("button", { name: "form.delete" }));
    expect(await screen.findByText("confirmDeleteBody:Tagihan jatuh tempo")).toBeInTheDocument();
  });

  it("keeps the header's add action to an icon on a phone, so the description has the width", () => {
    render(<TemplatesView />);
    const [phone, wide] = screen.getAllByRole("button", { name: "addNew" });
    expect(phone).toHaveClass("sm:hidden");
    expect(wide).toHaveClass("max-sm:hidden");
  });

  it("asks for the template language from a list of codes, not a free-text field", async () => {
    const user = userEvent.setup();
    render(<TemplatesView />);
    await user.click(screen.getByRole("button", { name: "form.edit" }));
    expect(screen.queryByRole("textbox", { name: "form.localeLabel" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "form.localeLabel" })).toHaveTextContent(
      "form.localeOption",
    );
  });
});

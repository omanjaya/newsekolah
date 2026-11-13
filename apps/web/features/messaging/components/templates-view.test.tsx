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
});

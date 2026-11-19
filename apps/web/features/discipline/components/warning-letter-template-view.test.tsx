import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ canEdit: true }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => mocks.canEdit }));
vi.mock("../api", () => ({
  useWarningLetterTemplateQuery: () => ({
    data: { number_pattern: "SP/", seq_pad: 3, opening_text: "", closing_text: "" },
    isLoading: false,
    isError: false,
  }),
  useUpdateWarningLetterTemplateMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { WarningLetterTemplateView } from "./warning-letter-template-view";

describe("WarningLetterTemplateView", () => {
  it("inserts automatic data by its name instead of making the admin type tokens", async () => {
    const user = userEvent.setup();
    render(<WarningLetterTemplateView />);

    const pattern = screen.getByRole("textbox", { name: "patternLabel" });
    await user.click(pattern);
    await user.click(screen.getByRole("button", { name: "tokens.seq" }));
    await user.type(pattern, "/");
    await user.click(screen.getByRole("button", { name: "tokens.year" }));

    expect(pattern).toHaveValue("SP/{{seq}}/{{year}}");
    expect(screen.queryByText("missingSeqError")).not.toBeInTheDocument();
  });

  it("offers no insert chips to someone who cannot edit", () => {
    mocks.canEdit = false;
    render(<WarningLetterTemplateView />);

    expect(screen.queryByRole("button", { name: "tokens.seq" })).not.toBeInTheDocument();
    mocks.canEdit = true;
  });
});

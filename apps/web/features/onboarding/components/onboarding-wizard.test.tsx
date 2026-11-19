import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OnboardingWizard } from "./onboarding-wizard";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/hooks/use-url-state", () => ({
  useUrlState: (_key: string, _values: readonly string[], fallback: string) => {
    const [value, setValue] = useState(fallback);
    return [value, setValue, setValue];
  },
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../school/components/import-layout", () => ({
  ImportFileField: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock("../api", () => ({
  useLevelTemplatesQuery: () => ({ data: { data: [] }, isLoading: false }),
  useApplyFullLevelTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

describe("OnboardingWizard", () => {
  it("starts at the template step until the template is in place", () => {
    render(<OnboardingWizard />);
    expect(screen.getByText("templateBody")).toBeInTheDocument();
  });

  it("starts at the upload step once the template has been applied", () => {
    render(<OnboardingWizard templateDone />);
    expect(screen.getByText("uploadBody")).toBeInTheDocument();
  });

  it("lets the upload step go back to the template", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard templateDone />);
    await user.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByText("templateBody")).toBeInTheDocument();
  });

  it("lets the upload step be skipped, with the import a link away", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard templateDone />);
    await user.click(screen.getByRole("button", { name: "skip" }));
    expect(screen.getByText("laterBody")).toBeInTheDocument();
    // Nothing was imported: the progress stays on the upload step.
    expect(screen.getByText("steps.upload").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("steps.done").closest("li")).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "laterImport" })).toHaveAttribute(
      "href",
      "/academic/enrollment-import",
    );
    await user.click(screen.getByRole("button", { name: "laterBack" }));
    expect(screen.getByText("uploadBody")).toBeInTheDocument();
  });
});

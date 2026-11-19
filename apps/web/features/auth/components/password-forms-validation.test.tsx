import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useChangePasswordMutation, useConfirmPasswordResetMutation } from "../api";

import { ChangePasswordForm } from "./change-password-form";
import { ResetPasswordForm } from "./reset-password-form";

/**
 * A too-short new password is the most common mistake on these forms. Its
 * zod message needs the `{min}` the schema enforces; without it the
 * translator used to throw during render and the error boundary replaced
 * the whole form. The validation copy here is the real shared catalogue
 * (translateFormMessage is not mocked), so a missing value would show.
 */

const mutateAsync = vi.fn();

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));

vi.mock("../api", () => ({
  useConfirmPasswordResetMutation: vi.fn(),
  useChangePasswordMutation: vi.fn(),
}));

vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));

beforeEach(() => {
  vi.clearAllMocks();
  const mutation = { mutateAsync, isPending: false, isError: false, error: null };
  vi.mocked(useConfirmPasswordResetMutation).mockReturnValue(mutation as never);
  vi.mocked(useChangePasswordMutation).mockReturnValue(mutation as never);
});

interface Case {
  name: string;
  element: () => ReactElement;
  fill: Record<string, string>;
}

const CASES: Case[] = [
  {
    name: "ResetPasswordForm",
    element: () => <ResetPasswordForm token="reset-token" onSuccess={vi.fn()} />,
    fill: { new_password: "abc", confirm_password: "abc" },
  },
  {
    name: "ChangePasswordForm",
    element: () => <ChangePasswordForm layout="auth" />,
    fill: { current_password: "sandi-lama", new_password: "abc", confirm_password: "abc" },
  },
];

function field(container: HTMLElement, name: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) throw new Error(`no ${name} field`);
  return input;
}

describe.each(CASES)("$name with a short new password", (testCase) => {
  it("shows the length error under the field and keeps the form", async () => {
    const user = userEvent.setup();
    const { container } = render(testCase.element());
    for (const [name, value] of Object.entries(testCase.fill)) {
      await user.type(field(container, name), value);
    }
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(await screen.findByText("Kata sandi minimal 8 karakter")).toBeInTheDocument();
    expect(field(container, "new_password")).toHaveValue("abc");
    expect(field(container, "new_password")).toHaveAttribute("aria-invalid", "true");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows the same length error on an empty submit and keeps the form", async () => {
    const user = userEvent.setup();
    const { container } = render(testCase.element());
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(await screen.findByText("Kata sandi minimal 8 karakter")).toBeInTheDocument();
    expect(field(container, "new_password")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

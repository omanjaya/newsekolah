import { act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useChangePasswordMutation,
  useConfirmPasswordResetMutation,
  useGoogleSSOAvailabilityQuery,
  useLoginMutation,
  useRequestPasswordResetMutation,
} from "../api";

import { ChangePasswordForm } from "./change-password-form";
import { ForgotPasswordForm } from "./forgot-password-form";
import { LoginForm } from "./login-form";
import { ResetPasswordForm } from "./reset-password-form";

/**
 * The sign-in forms are in the server markup. Before React attaches the
 * submit handler a press would run the browser's own submit, which used to
 * be a GET with the password in the URL. Each form must declare
 * method="post" and keep its submit control disabled until hydration, then
 * submit through the app's handler.
 */

const mutateAsync = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));

vi.mock("../api", () => ({
  useGoogleSSOAvailabilityQuery: vi.fn(),
  useLoginMutation: vi.fn(),
  useRequestPasswordResetMutation: vi.fn(),
  useConfirmPasswordResetMutation: vi.fn(),
  useChangePasswordMutation: vi.fn(),
}));

vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));

vi.mock("../../../lib/webauthn", () => ({
  usePasskeySupported: () => false,
}));

vi.mock("./google-sign-in-button", () => ({ GoogleSignInButton: () => null }));
vi.mock("./passkey-login-button", () => ({ PasskeyLoginButton: () => null }));

interface Case {
  name: string;
  element: () => ReactElement;
  submitLabel: string;
  fill: Record<string, string>;
  expected: unknown;
}

const NEW_PASSWORD = "sandi-baru-2026";

const CASES: Case[] = [
  {
    name: "LoginForm",
    element: () => <LoginForm />,
    submitLabel: "submit",
    fill: { username: "guru", password: "rahasia" },
    expected: { username: "guru", password: "rahasia", client: "web" },
  },
  {
    name: "ForgotPasswordForm",
    element: () => <ForgotPasswordForm onSent={vi.fn()} />,
    submitLabel: "submit",
    fill: { username_or_email: "guru" },
    expected: "guru",
  },
  {
    name: "ResetPasswordForm",
    element: () => <ResetPasswordForm token="reset-token" onSuccess={vi.fn()} />,
    submitLabel: "submit",
    fill: { new_password: NEW_PASSWORD, confirm_password: NEW_PASSWORD },
    expected: { token: "reset-token", new_password: NEW_PASSWORD },
  },
  {
    name: "ChangePasswordForm",
    element: () => <ChangePasswordForm layout="auth" />,
    submitLabel: "submit",
    fill: {
      current_password: "sandi-lama",
      new_password: NEW_PASSWORD,
      confirm_password: NEW_PASSWORD,
    },
    expected: { current_password: "sandi-lama", new_password: NEW_PASSWORD },
  },
];

let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue(undefined);
  const mutation = { mutateAsync, isPending: false, isError: false, error: null };
  vi.mocked(useLoginMutation).mockReturnValue(mutation as never);
  vi.mocked(useRequestPasswordResetMutation).mockReturnValue(mutation as never);
  vi.mocked(useConfirmPasswordResetMutation).mockReturnValue(mutation as never);
  vi.mocked(useChangePasswordMutation).mockReturnValue(mutation as never);
  vi.mocked(useGoogleSSOAvailabilityQuery).mockReturnValue({ data: { enabled: false } } as never);
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

/** The server's HTML as the browser shows it before any script runs. */
function serverMarkup(element: ReactElement): HTMLDivElement {
  container.innerHTML = renderToString(element);
  return container;
}

describe.each(CASES)("$name before and after hydration", (testCase) => {
  it("server-renders a POST form whose submit control is disabled", () => {
    const markup = serverMarkup(testCase.element());
    const form = markup.querySelector("form");
    expect(form).toHaveAttribute("method", "post");
    const submit = markup.querySelector("button[type=submit]");
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent(testCase.submitLabel);
    for (const name of Object.keys(testCase.fill)) {
      expect(markup.querySelector(`input[name="${name}"]`)).not.toBeNull();
    }
  });

  it("enables the submit control once hydrated and submits through the handler", async () => {
    container.innerHTML = renderToString(testCase.element());
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, testCase.element());
      await Promise.resolve();
    });

    const submit = within(container).getByRole("button", { name: testCase.submitLabel });
    expect(submit).toBeEnabled();
    expect(submit).toHaveAttribute("type", "submit");

    const user = userEvent.setup();
    for (const [name, value] of Object.entries(testCase.fill)) {
      const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (!input) throw new Error(`no ${name} field`);
      await user.type(input, value);
    }
    await user.click(submit);

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith(testCase.expected);
    act(() => {
      root?.unmount();
    });
  });
});

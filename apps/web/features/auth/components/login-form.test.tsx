import { ApiError } from "@newsekolah/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGoogleSSOAvailabilityQuery, useLoginMutation } from "../api";

import { LoginForm } from "./login-form";

const replace = vi.fn();
const mutateAsync = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

vi.mock("../api", () => ({
  useGoogleSSOAvailabilityQuery: vi.fn(),
  useLoginMutation: vi.fn(),
}));

vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));

vi.mock("../../../lib/webauthn", () => ({
  usePasskeySupported: () => false,
}));

vi.mock("./google-sign-in-button", () => ({ GoogleSignInButton: () => null }));
vi.mock("./passkey-login-button", () => ({ PasskeyLoginButton: () => null }));

const mockedLoginMutation = vi.mocked(useLoginMutation);
const mockedGoogle = vi.mocked(useGoogleSSOAvailabilityQuery);

describe("LoginForm auth affordances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGoogle.mockReturnValue({ data: { enabled: false } } as never);
    mockedLoginMutation.mockReturnValue({ mutateAsync, isPending: false } as never);
    mutateAsync.mockResolvedValue(undefined);
  });

  it("toggles password visibility without losing the entered value", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const password = screen.getByPlaceholderText("passwordPlaceholder");

    await user.type(password, "secret-value");
    await user.click(screen.getByRole("button", { name: "showPassword" }));

    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("secret-value");
    expect(screen.getByRole("button", { name: "hidePassword" })).toBeInTheDocument();
  });

  it("focuses the OTP field when the server requests MFA", async () => {
    mutateAsync.mockRejectedValue(
      new ApiError({ status: 401, code: "MFA_REQUIRED", message: "MFA required" }),
    );
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByPlaceholderText("usernamePlaceholder"), "teacher");
    await user.type(screen.getByPlaceholderText("passwordPlaceholder"), "secret-value");
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "login.otpLabel" })).toHaveFocus();
    });
  });
});

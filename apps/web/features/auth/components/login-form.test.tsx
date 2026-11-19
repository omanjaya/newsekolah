import { ApiError } from "@newsekolah/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGoogleSSOAvailabilityQuery, useLoginMutation } from "../api";

import { LoginForm } from "./login-form";

const replace = vi.fn();
const search = vi.hoisted(() => ({ query: "" }));
const mutateAsync = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search.query),
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
    search.query = "";
  });

  it("says why it is showing when the session ran out mid-visit", async () => {
    search.query = "next=%2Fdashboard&reason=session-ended";
    mutateAsync.mockRejectedValue(
      new ApiError({ status: 401, code: "AUTH_INVALID_CREDENTIALS", message: "wrong" }),
    );
    const user = userEvent.setup();
    render(<LoginForm />);
    expect(screen.getByRole("status")).toHaveTextContent("sessionEnded");

    // A failed attempt's error takes its place: one message at a time.
    await user.type(screen.getByLabelText("usernameLabel"), "teacher");
    await user.type(screen.getByLabelText("passwordLabel"), "wrong-value");
    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AUTH_INVALID_CREDENTIALS");
    expect(screen.queryByText("sessionEnded")).not.toBeInTheDocument();
  });

  it("shows no notice on a plain visit to the sign-in page", () => {
    search.query = "next=%2Fdashboard";
    render(<LoginForm />);
    expect(screen.queryByText("sessionEnded")).not.toBeInTheDocument();
  });

  it("toggles password visibility without losing the entered value", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const password = screen.getByLabelText("passwordLabel");

    await user.type(password, "secret-value");
    await user.click(screen.getByRole("button", { name: "Tampilkan kata sandi" }));

    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("secret-value");
    expect(screen.getByRole("button", { name: "Sembunyikan kata sandi" })).toBeInTheDocument();
  });

  it("offers the forgot-password link on the password label's row", () => {
    render(<LoginForm />);
    expect(screen.getByRole("link", { name: "forgotPasswordLink" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("focuses the OTP field when the server requests MFA", async () => {
    mutateAsync.mockRejectedValue(
      new ApiError({ status: 401, code: "MFA_REQUIRED", message: "MFA required" }),
    );
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("usernameLabel"), "teacher");
    await user.type(screen.getByLabelText("passwordLabel"), "secret-value");
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "login.otpLabel" })).toHaveFocus();
    });
  });

  it("announces a rejected sign-in as a danger alert with the server's reason", async () => {
    mutateAsync.mockRejectedValue(
      new ApiError({ status: 401, code: "AUTH_INVALID_CREDENTIALS", message: "wrong" }),
    );
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("usernameLabel"), "teacher");
    await user.type(screen.getByLabelText("passwordLabel"), "wrong-value");
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("AUTH_INVALID_CREDENTIALS");
    expect(replace).not.toHaveBeenCalled();
  });
});

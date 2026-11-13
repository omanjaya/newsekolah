import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ResetPasswordPage from "./page";

const params = vi.fn<() => URLSearchParams>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => params(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../features/auth/components/reset-password-form", () => ({
  ResetPasswordForm: () => <form aria-label="form" />,
}));

afterEach(cleanup);

describe("ResetPasswordPage", () => {
  it("titles a link without a token as no longer valid and offers one clear next step", () => {
    params.mockReturnValue(new URLSearchParams());
    render(<ResetPasswordPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("invalidTitle");
    expect(screen.getByRole("link", { name: "requestNew" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("keeps the set-password title when a token is present", () => {
    params.mockReturnValue(new URLSearchParams("token=abc"));
    render(<ResetPasswordPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("title");
    expect(screen.getByRole("form", { name: "form" })).toBeInTheDocument();
  });
});

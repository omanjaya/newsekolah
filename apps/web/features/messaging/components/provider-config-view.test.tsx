import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProviderConfigView } from "./provider-config-view";
import type { ProviderConfigForm, ProviderFormState } from "./use-provider-config-form";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../components/query-error", () => ({
  QueryError: () => <p>query error</p>,
}));

const FORM: ProviderFormState = {
  provider: "meta",
  phoneNumberId: "123",
  accessToken: "",
  gatewayUrl: "",
  gatewayHeaderName: "",
  gatewayHeaderValue: "",
  isActive: false,
};

function controller(query: Partial<ProviderConfigForm["query"]>): ProviderConfigForm {
  return {
    query: query as ProviderConfigForm["query"],
    form: FORM,
    update: vi.fn(),
    dirty: false,
    saving: false,
    save: vi.fn(),
    discard: vi.fn(),
  };
}

describe("ProviderConfigView", () => {
  it("says a failed load instead of showing an empty form", () => {
    render(
      <ProviderConfigView
        controller={controller({ isError: true, isLoading: false, data: undefined })}
      />,
    );
    expect(screen.getByText("query error")).toBeInTheDocument();
  });

  it("treats a saved token as write-only, like the SSO secret", () => {
    render(
      <ProviderConfigView
        controller={controller({
          isError: false,
          isLoading: false,
          data: { provider: "meta", is_active: false, has_access_token: true },
        } as Partial<ProviderConfigForm["query"]>)}
      />,
    );
    const token = screen.getByLabelText("meta.accessTokenLabel");
    expect(token).toHaveAttribute("type", "password");
    expect(token).toHaveAttribute("placeholder", "unchangedPlaceholder");
    expect(screen.getByText("meta.accessTokenKeepHint")).toBeInTheDocument();
  });

  it("puts the activation switch beside its label and hint, with no save button of its own", () => {
    render(
      <ProviderConfigView
        controller={controller({
          isError: false,
          isLoading: false,
          data: { provider: "meta", is_active: false },
        } as Partial<ProviderConfigForm["query"]>)}
      />,
    );
    expect(screen.getByRole("switch", { name: "activeLabel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SsoView } from "./sso-view";

const configQuery = vi.fn<() => unknown>();
const saveMock = vi.fn(() => Promise.resolve());

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../settings/components/settings-page", () => ({
  SettingsPage: ({
    actions,
    children,
    floating,
  }: {
    actions?: ReactNode;
    children: ReactNode;
    floating?: ReactNode;
  }) => (
    <div>
      <div data-testid="header-actions">{actions}</div>
      {children}
      {floating}
    </div>
  ),
}));
vi.mock("../../../lib/navigation/use-unsaved-changes-protection", () => ({
  useUnsavedChangesProtection: () => undefined,
}));
vi.mock("../api", () => ({
  useGoogleSSOConfigQuery: () => configQuery() as never,
  useSaveGoogleSSOConfigMutation: () => ({ mutateAsync: saveMock, isPending: false }),
  useRemoveGoogleSSOConfigMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  configQuery.mockReset();
  saveMock.mockClear();
});

afterEach(cleanup);

describe("SsoView status", () => {
  it("shows a neutral not-set-up badge and no switch before the first configuration", () => {
    configQuery.mockReturnValue({
      data: { configured: false, enabled: false },
      isLoading: false,
      isError: false,
    });
    render(<SsoView />);
    expect(screen.getByTestId("header-actions")).toHaveTextContent("statusUnset");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    // The setup note opens the credentials card instead of a card of its own.
    expect(screen.queryByText("statusTitle")).not.toBeInTheDocument();
    expect(screen.getByText("neverConfigured")).toBeInTheDocument();
  });

  it("explains the Client ID's shape in a hint, not a placeholder cut on a phone", () => {
    configQuery.mockReturnValue({
      data: { configured: false, enabled: false },
      isLoading: false,
      isError: false,
    });
    render(<SsoView />);
    expect(screen.getByRole("textbox", { name: /clientIdLabel/ })).not.toHaveAttribute(
      "placeholder",
    );
    expect(screen.getByText("clientIdHint")).toBeInTheDocument();
  });

  it("keeps the switch and the badge in agreement once configured", () => {
    configQuery.mockReturnValue({
      data: { configured: true, enabled: true, client_id: "id", hosted_domain: "school.id" },
      isLoading: false,
      isError: false,
    });
    render(<SsoView />);
    expect(screen.getByTestId("header-actions")).toHaveTextContent("statusOn");
    expect(screen.getByText("statusTitle")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("flags a missing domain on its field instead of saving", async () => {
    configQuery.mockReturnValue({
      data: { configured: false, enabled: false },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    render(<SsoView />);
    await user.type(screen.getByRole("textbox", { name: /clientIdLabel/ }), "abc");
    await user.click(screen.getByRole("button", { name: "saveAndEnable" }));
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByText("hostedDomainRequired")).toBeInTheDocument();
  });

  it("requires the client secret on the first setup, on its own field", async () => {
    configQuery.mockReturnValue({
      data: { configured: false, enabled: false },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    render(<SsoView />);
    await user.type(screen.getByRole("textbox", { name: /clientIdLabel/ }), "abc");
    await user.type(screen.getByRole("textbox", { name: /hostedDomainLabel/ }), "school.id");
    await user.click(screen.getByRole("button", { name: "saveAndEnable" }));
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByText("clientSecretRequired")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/clientSecretLabel/), "s3cret");
    await user.click(screen.getByRole("button", { name: "saveAndEnable" }));
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ client_secret: "s3cret" }));
  });

  it("keeps the stored secret when the field is left empty once configured", async () => {
    configQuery.mockReturnValue({
      data: { configured: true, enabled: true, client_id: "id", hosted_domain: "school.id" },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    render(<SsoView />);
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.queryByText("clientSecretRequired")).not.toBeInTheDocument();
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ client_secret: undefined }));
  });
});

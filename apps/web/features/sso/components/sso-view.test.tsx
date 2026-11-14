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
  SettingsPage: ({ children, floating }: { children: ReactNode; floating?: ReactNode }) => (
    <div>
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
    expect(screen.getByText("statusUnset")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("keeps the switch and the badge in agreement once configured", () => {
    configQuery.mockReturnValue({
      data: { configured: true, enabled: true, client_id: "id", hosted_domain: "school.id" },
      isLoading: false,
      isError: false,
    });
    render(<SsoView />);
    expect(screen.getByText("statusOn")).toBeInTheDocument();
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
});

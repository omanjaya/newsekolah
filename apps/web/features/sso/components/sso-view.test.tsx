import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SsoView } from "./sso-view";

const configQuery = vi.fn<() => unknown>();

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../api", () => ({
  useGoogleSSOConfigQuery: () => configQuery() as never,
  useSaveGoogleSSOConfigMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveGoogleSSOConfigMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  configQuery.mockReset();
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
});

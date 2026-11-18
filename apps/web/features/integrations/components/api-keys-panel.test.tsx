import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APIKeysPanel } from "./api-keys-panel";

const keysQuery = vi.fn<() => unknown>();

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, {
      has: (key: string) => key === "permissions.view_billing.label",
    }),
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" }, permissions: [] } }),
}));
vi.mock("./create-api-key-dialog", () => ({ CreateAPIKeyDialog: () => null }));
vi.mock("../api", () => ({
  useAPIKeysQuery: () => keysQuery() as never,
  useRevokeAPIKeyMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  keysQuery.mockReset();
});

afterEach(cleanup);

describe("APIKeysPanel", () => {
  it("shows a retry control, not the empty state, when the keys fail to load", () => {
    keysQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<APIKeysPanel />);
    // The table's own error state, with its retry (UiLabels.tableRetry).
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });

  it("names permissions with their catalog label and falls back to the code", () => {
    keysQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        data: [
          {
            id: "k1",
            name: "Integrasi",
            permissions: ["view_billing", "unknown_code"],
            revoked_at: null,
            expires_at: null,
            last_used_at: null,
          },
        ],
      },
    });
    render(<APIKeysPanel />);
    expect(screen.getAllByText("permissions.view_billing.label").length).toBeGreaterThan(0);
    expect(screen.getAllByText("unknown_code").length).toBeGreaterThan(0);
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationDefaultsView } from "./notification-defaults-view";
import { NotificationSettingsView } from "./notification-settings-view";

const prefsQuery = vi.fn<() => unknown>();
const defaultQuery = vi.fn<() => unknown>();

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("./push-devices-section", () => ({ PushDevicesSection: () => null }));
vi.mock("../../notifications/api", () => ({
  NOTIFICATION_CHANNELS: ["inapp", "push"],
  useNotificationKinds: () => ["announcement"],
  usePreferencesQuery: () => prefsQuery() as never,
  useSetPreferenceMutation: () => ({ mutate: vi.fn() }),
  useNotificationSettingsQuery: () => ({ data: undefined, isLoading: true, isError: false }),
  useUpdateNotificationSettingsMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useTenantNotificationDefaultQuery: () => defaultQuery() as never,
  useSetTenantNotificationDefaultMutation: () => ({ mutate: vi.fn() }),
}));

beforeEach(() => {
  prefsQuery.mockReset();
  defaultQuery.mockReset();
});

afterEach(cleanup);

describe("NotificationSettingsView", () => {
  it("does not render all-off switches when the preferences fail to load", () => {
    prefsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<NotificationSettingsView />);
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });
});

describe("NotificationDefaultsView", () => {
  it("offers a retry for a row whose default failed to load instead of showing it off", () => {
    defaultQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<NotificationDefaultsView />);
    expect(screen.getAllByRole("button", { name: "actions.retry" }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });
});

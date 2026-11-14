import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationDefaultsView } from "./notification-defaults-view";
import { NotificationSettingsView } from "./notification-settings-view";

const prefsQuery = vi.fn<() => unknown>();
const settingsQuery = vi.fn<() => unknown>();
const defaultsGet = vi.fn<() => Promise<unknown>>();
const setPreference = vi.fn();

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/api/client", () => ({
  useApiClient: () => ({ GET: defaultsGet }),
}));
vi.mock("../../../lib/navigation/use-unsaved-changes-protection", () => ({
  useUnsavedChangesProtection: () => undefined,
}));
vi.mock("./settings-page", () => ({
  SettingsPage: ({ children, floating }: { children: ReactNode; floating?: ReactNode }) => (
    <div>
      {children}
      {floating}
    </div>
  ),
}));
vi.mock("./push-devices-section", () => ({ PushDevicesSection: () => null }));
vi.mock("../../notifications/api", () => ({
  NOTIFICATION_CHANNELS: ["inapp", "push"],
  useNotificationKinds: () => ["announcement"],
  usePreferencesQuery: () => prefsQuery() as never,
  useSetPreferenceMutation: () => ({ mutate: setPreference }),
  useNotificationSettingsQuery: () => settingsQuery() as never,
  useUpdateNotificationSettingsMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useSetTenantNotificationDefaultMutation: () => ({ mutate: vi.fn() }),
}));

function renderWithQueries(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  prefsQuery.mockReset();
  settingsQuery.mockReset();
  settingsQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  defaultsGet.mockReset();
  setPreference.mockReset();
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

  it("leaves the always-on inbox out of the channels and saves a switch at once", async () => {
    prefsQuery.mockReturnValue({
      data: { announcement: { inapp: true, push: false } },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    render(<NotificationSettingsView />);
    expect(screen.queryByText("channels.inapp")).not.toBeInTheDocument();
    const [push] = screen.getAllByRole("switch", { name: /channels.push/ });
    if (push) await user.click(push);
    expect(setPreference).toHaveBeenCalledWith(
      { kind: "announcement", channel: "push", enabled: true },
      expect.anything(),
    );
  });

  it("offers to save quiet hours only once they change", async () => {
    prefsQuery.mockReturnValue({ data: {}, isLoading: false, isError: false });
    settingsQuery.mockReturnValue({
      data: { digest_enabled: false, digest_hour: 7 },
      dataUpdatedAt: 1,
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    render(<NotificationSettingsView />);
    expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "quietHoursLabel" }));
    expect(screen.getByRole("button", { name: "save" })).toBeInTheDocument();
  });
});

describe("NotificationDefaultsView", () => {
  it("offers a retry for a row whose default failed to load instead of showing it off", async () => {
    defaultsGet.mockRejectedValue(new Error("offline"));
    renderWithQueries(<NotificationDefaultsView />);
    expect(
      (await screen.findAllByRole("button", { name: "actions.retry" })).length,
    ).toBeGreaterThan(0);
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });
});

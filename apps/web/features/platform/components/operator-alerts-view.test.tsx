import type * as UiModule from "@newsekolah/ui";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlatformOperatorAlertSettings } from "../api";

import { OperatorAlertsView } from "./operator-alerts-view";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  detect: vi.fn(),
  test: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  queryState: {
    data: undefined as PlatformOperatorAlertSettings | undefined,
    isLoading: false,
    isError: false,
  },
}));

const baseSettings: PlatformOperatorAlertSettings = {
  enabled: false,
  telegram_chat_id: "",
  telegram_token_set: false,
  check_health: true,
  check_containers: true,
  check_disk: true,
  check_memory: true,
  check_backup: true,
  check_certificate: true,
  check_errors_5xx: true,
  disk_threshold_percent: 85,
  memory_threshold_mb: 512,
  backup_max_age_hours: 30,
  cert_expiry_days: 14,
  daily_summary_enabled: false,
  daily_summary_hour: 7,
  updated_at: "2026-01-01T00:00:00Z",
};

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../api", () => ({
  useOperatorAlertSettingsQuery: () => mocks.queryState,
  useUpdateOperatorAlertSettingsMutation: () => ({ mutateAsync: mocks.save, isPending: false }),
  useDetectOperatorAlertChatMutation: () => ({ mutateAsync: mocks.detect, isPending: false }),
  useTestOperatorAlertMutation: () => ({ mutateAsync: mocks.test, isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return {
    ...actual,
    useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError }),
  };
});

describe("OperatorAlertsView", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {
          return undefined;
        }
        unobserve() {
          return undefined;
        }
        disconnect() {
          return undefined;
        }
      },
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryState = { data: { ...baseSettings }, isLoading: false, isError: false };
  });

  it("shows a loading skeleton while the query is pending", () => {
    mocks.queryState = { data: undefined, isLoading: true, isError: false };
    render(<OperatorAlertsView />);
    expect(screen.queryByText("save")).not.toBeInTheDocument();
  });

  it("shows an error state when the query fails", () => {
    mocks.queryState = { data: undefined, isLoading: false, isError: true };
    render(<OperatorAlertsView />);
    expect(screen.getByText("loadError")).toBeInTheDocument();
  });

  it("shows the token-saved placeholder and a remove action when a token is stored", () => {
    mocks.queryState = {
      data: { ...baseSettings, telegram_token_set: true, telegram_token_hint: "•1234" },
      isLoading: false,
      isError: false,
    };
    render(<OperatorAlertsView />);
    expect(screen.getByRole("button", { name: "token.remove" })).toBeInTheDocument();
  });

  it("saves the form with edited fields, keeping the rest unchanged", async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValue({ ...baseSettings, enabled: true });
    render(<OperatorAlertsView />);

    await user.click(screen.getByRole("switch", { name: "enabled" }));
    await user.type(screen.getByRole("textbox", { name: "chatId.label" }), "-100123");
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          telegram_chat_id: "-100123",
          disk_threshold_percent: 85,
          check_health: true,
        }),
      );
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("saved");
  });

  it("lists candidate chats after a successful detect", async () => {
    const user = userEvent.setup();
    mocks.detect.mockResolvedValue({ data: [{ id: 111, type: "private", title: "Budi" }] });
    render(<OperatorAlertsView />);

    await user.click(screen.getByRole("button", { name: "detect.button" }));

    await waitFor(() => {
      expect(mocks.detect).toHaveBeenCalled();
    });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("shows the empty-detect message when no chats are found", async () => {
    const user = userEvent.setup();
    mocks.detect.mockResolvedValue({ data: [] });
    render(<OperatorAlertsView />);

    await user.click(screen.getByRole("button", { name: "detect.button" }));

    expect(await screen.findByText("detect.empty")).toBeInTheDocument();
  });

  it("reports a failed test message with Telegram's own description", async () => {
    const user = userEvent.setup();
    mocks.queryState = {
      ...mocks.queryState,
      data: { ...baseSettings, telegram_token_set: true, telegram_chat_id: "992495341" },
    };
    mocks.test.mockResolvedValue({ success: false, error: "chat not found" });
    render(<OperatorAlertsView />);

    await user.click(screen.getByRole("button", { name: "test.button" }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("chat not found");
    });
  });

  it("reports a successful test message", async () => {
    const user = userEvent.setup();
    mocks.queryState = {
      ...mocks.queryState,
      data: { ...baseSettings, telegram_token_set: true, telegram_chat_id: "992495341" },
    };
    mocks.test.mockResolvedValue({ success: true });
    render(<OperatorAlertsView />);

    await user.click(screen.getByRole("button", { name: "test.button" }));

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("test.success");
    });
    expect(mocks.test).toHaveBeenCalledWith({
      telegramToken: undefined,
      telegramChatId: "992495341",
    });
  });

  it("asks for a token before testing when none is saved or typed", async () => {
    const user = userEvent.setup();
    render(<OperatorAlertsView />);

    await user.click(screen.getByRole("button", { name: "test.button" }));

    expect(mocks.toastError).toHaveBeenCalledWith("test.needToken");
    expect(mocks.test).not.toHaveBeenCalled();
  });
});

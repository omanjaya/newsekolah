import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PushDevicesSection } from "./push-devices-section";

const devicesQuery = vi.fn<() => unknown>();

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../notifications/push-api", () => ({
  usePushDevicesQuery: () => devicesQuery() as never,
  useWebPush: () => ({ state: "unsupported", busy: false, enable: vi.fn(), disable: vi.fn() }),
}));

afterEach(cleanup);

describe("PushDevicesSection", () => {
  it("shows a retryable error instead of 'no devices' when the list fails to load", () => {
    devicesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<PushDevicesSection />);
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
    expect(screen.queryByText("noDevices")).not.toBeInTheDocument();
  });

  it("says there are no devices when the list loads empty", () => {
    devicesQuery.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
    render(<PushDevicesSection />);
    expect(screen.getByText("noDevices")).toBeInTheDocument();
  });
});

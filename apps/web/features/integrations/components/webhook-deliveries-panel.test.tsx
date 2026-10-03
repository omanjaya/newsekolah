import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useWebhookDeliveriesQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../api", () => ({
  useWebhookDeliveriesQuery: mocks.useWebhookDeliveriesQuery,
  useWebhookEndpointsQuery: () => ({
    data: {
      data: [
        { id: "endpoint-a", url: "https://a.example.com/hook" },
        { id: "endpoint-b", url: "https://b.example.com/hook" },
      ],
    },
    isLoading: false,
  }),
  useRetryWebhookDeliveryMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { WebhookDeliveriesPanel } from "./webhook-deliveries-panel";

describe("WebhookDeliveriesPanel filters", () => {
  beforeEach(() => {
    mocks.useWebhookDeliveriesQuery.mockReset();
    mocks.useWebhookDeliveriesQuery.mockReturnValue({
      data: { data: [], page: { next_cursor: null } },
      isLoading: false,
    });
  });

  it("passes the chosen endpoint to the deliveries query and reports it to the parent", async () => {
    const onEndpointChange = vi.fn();
    const user = userEvent.setup();
    render(<WebhookDeliveriesPanel endpointId="" onEndpointChange={onEndpointChange} />);

    await user.click(screen.getByRole("button", { name: "filterEndpoint" }));
    await user.click(await screen.findByRole("button", { name: "https://a.example.com/hook" }));

    expect(onEndpointChange).toHaveBeenCalledWith("endpoint-a");
  });

  it("reads the active endpoint back into the filter bar", () => {
    render(<WebhookDeliveriesPanel endpointId="endpoint-b" onEndpointChange={vi.fn()} />);

    expect(mocks.useWebhookDeliveriesQuery).toHaveBeenLastCalledWith("endpoint-b", "");
    expect(
      screen.getByRole("button", { name: "filterEndpoint: https://b.example.com/hook" }),
    ).toBeInTheDocument();
  });

  it("clears the endpoint filter from its chip's remove control", async () => {
    const onEndpointChange = vi.fn();
    const user = userEvent.setup();
    render(<WebhookDeliveriesPanel endpointId="endpoint-a" onEndpointChange={onEndpointChange} />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(onEndpointChange).toHaveBeenCalledWith("");
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useWebhookDeliveriesQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: { code?: unknown }) =>
        values && "code" in values ? `${key}:${String(values.code)}` : key,
      { has: () => false },
    ),
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

    await user.click(screen.getByRole("button", { name: /^Hapus filter / }));
    expect(onEndpointChange).toHaveBeenCalledWith("");
  });

  it("shows a retry control, not the empty state, when the request fails", () => {
    mocks.useWebhookDeliveriesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<WebhookDeliveriesPanel endpointId="" onEndpointChange={vi.fn()} />);
    // The table's own error state, with its retry (UiLabels.tableRetry).
    expect(screen.getAllByRole("button", { name: "Coba lagi" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });

  // admin-settings-R4: the reason column showed the worker's English Go
  // error ("receiver responded 405"); it now names the reason code.
  it("names a failure by its reason code, never the server's error text", () => {
    mocks.useWebhookDeliveriesQuery.mockReturnValue({
      data: {
        data: [
          {
            id: "d1",
            endpoint_id: "endpoint-a",
            event_type: "announcement.published",
            status: "pending",
            attempt_count: 1,
            last_status_code: 405,
            failure_reason: "http_status",
            last_error: "receiver responded 405",
            created_at: "2026-11-20T03:00:00Z",
          },
          {
            id: "d2",
            endpoint_id: "endpoint-a",
            event_type: "announcement.published",
            status: "failed",
            attempt_count: 8,
            failure_reason: "unreachable",
            last_error: 'send webhook request: Post "https://a.example.com/hook": dial tcp',
            created_at: "2026-11-19T03:00:00Z",
          },
        ],
        page: { next_cursor: null },
      },
      isLoading: false,
    });
    render(<WebhookDeliveriesPanel endpointId="" onEndpointChange={vi.fn()} />);

    expect(screen.getAllByText("reason.http_status:405").length).toBeGreaterThan(0);
    expect(screen.getAllByText("reason.unreachable:").length).toBeGreaterThan(0);
    expect(screen.queryByText(/receiver responded/)).not.toBeInTheDocument();
    expect(screen.queryByText(/dial tcp/)).not.toBeInTheDocument();
  });

  // The log has an endpoint filter but no search box.
  it("does not suggest another keyword when the filter matches nothing", () => {
    render(<WebhookDeliveriesPanel endpointId="endpoint-a" onEndpointChange={vi.fn()} />);

    expect(screen.getAllByText("Ubah atau hapus filter yang aktif.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/kata kunci/)).not.toBeInTheDocument();
  });
});

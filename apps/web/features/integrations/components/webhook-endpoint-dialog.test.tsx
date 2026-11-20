import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WebhookEndpointDialog } from "./webhook-endpoint-dialog";

const createEndpoint = vi.fn();
const updateEndpoint = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { permissions: [] } }),
}));
vi.mock("../../../lib/modules/feature-modules", () => ({ isModuleEnabled: () => true }));
vi.mock("../lib/use-webhook-event-label", () => ({
  useWebhookEventLabel: () => (eventType: string) => eventType,
}));
vi.mock("../api", () => ({
  useWebhookEventTypesQuery: () => ({ data: { data: ["attendance.submitted"] } }),
  useCreateWebhookEndpointMutation: () => ({ mutateAsync: createEndpoint, isPending: false }),
  useUpdateWebhookEndpointMutation: () => ({ mutateAsync: updateEndpoint, isPending: false }),
}));

afterEach(() => {
  cleanup();
  createEndpoint.mockReset();
  updateEndpoint.mockReset();
});

describe("WebhookEndpointDialog", () => {
  it("shows the signing secret once after registering instead of closing", async () => {
    createEndpoint.mockResolvedValue({
      webhook_endpoint: { id: "e1" },
      signing_secret: "whsec_example-secret",
    });
    const onOpenChange = vi.fn();
    render(<WebhookEndpointDialog open onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByRole("textbox", { name: /urlLabel/ }), {
      target: { value: "https://example.com/hook" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /attendance\.submitted/ }));
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    expect(await screen.findByText("whsec_example-secret")).toBeInTheDocument();
    expect(screen.getByText("secretWarning")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(createEndpoint).toHaveBeenCalledWith({
      url: "https://example.com/hook",
      description: undefined,
      event_types: ["attendance.submitted"],
    });

    fireEvent.click(screen.getByRole("button", { name: "secretDone" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes right away after editing, with no secret step", async () => {
    updateEndpoint.mockResolvedValue({ id: "e1" });
    const onOpenChange = vi.fn();
    render(
      <WebhookEndpointDialog
        open
        onOpenChange={onOpenChange}
        endpoint={{
          id: "e1",
          url: "https://example.com/hook",
          description: "",
          event_types: ["attendance.submitted"],
          status: "active",
          disabled_reason: "",
          consecutive_failures: 0,
          created_at: "2026-11-20T00:00:00Z",
          updated_at: "2026-11-20T00:00:00Z",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(screen.queryByText("secretWarning")).not.toBeInTheDocument();
  });
});

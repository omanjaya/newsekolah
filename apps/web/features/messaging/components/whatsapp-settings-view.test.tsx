import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WhatsAppSettingsView } from "./whatsapp-settings-view";

const frame = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../settings/components/settings-page", () => ({
  SettingsPage: (props: { navKey: string; children: ReactNode }) => {
    frame(props);
    return <div data-testid="settings-frame">{props.children}</div>;
  },
}));
vi.mock("./provider-config-view", () => ({ ProviderConfigView: () => <p>provider</p> }));
vi.mock("./templates-view", () => ({ TemplatesView: () => <p>templates</p> }));
vi.mock("./deliveries-view", () => ({ DeliveriesView: () => <p>deliveries</p> }));

afterEach(() => {
  cleanup();
  frame.mockClear();
});

describe("WhatsAppSettingsView", () => {
  it("renders inside the settings frame under its own registry entry", () => {
    render(<WhatsAppSettingsView />);
    expect(frame).toHaveBeenCalledWith(
      expect.objectContaining({ navKey: "settings-whatsapp", description: "description" }),
    );
    expect(screen.getByTestId("settings-frame")).toContainElement(
      screen.getByRole("tablist", { name: "title" }),
    );
  });

  it("keeps its three panels as tabs, opening on the provider", () => {
    render(<WhatsAppSettingsView />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "tabs.provider",
      "tabs.templates",
      "tabs.deliveries",
    ]);
    expect(screen.getByText("provider")).toBeInTheDocument();
  });
});

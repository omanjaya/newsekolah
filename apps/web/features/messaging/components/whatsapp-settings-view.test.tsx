import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WhatsAppSettingsView } from "./whatsapp-settings-view";

const frame = vi.hoisted(() => vi.fn());
const provider = vi.hoisted(() => ({ dirty: false }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../settings/components/settings-page", () => ({
  SettingsPage: (props: { navKey: string; children: ReactNode; floating?: ReactNode }) => {
    frame(props);
    return (
      <div data-testid="settings-frame">
        {props.children}
        {props.floating}
      </div>
    );
  },
}));
vi.mock("../../settings/components/settings-save-bar", () => ({
  SettingsSaveBar: ({ dirty }: { dirty: boolean }) => (dirty ? <p>save bar</p> : null),
}));
vi.mock("./use-provider-config-form", () => ({
  useProviderConfigForm: () => ({
    dirty: provider.dirty,
    saving: false,
    save: vi.fn(),
    discard: vi.fn(),
  }),
}));
vi.mock("./provider-config-view", () => ({ ProviderConfigView: () => <p>provider</p> }));
vi.mock("./templates-view", () => ({ TemplatesView: () => <p>templates</p> }));
vi.mock("./deliveries-view", () => ({ DeliveriesView: () => <p>deliveries</p> }));

beforeEach(() => {
  provider.dirty = false;
  window.history.replaceState(null, "", "/settings/whatsapp");
});

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

  it("keeps the open panel in the URL", async () => {
    const user = userEvent.setup();
    render(<WhatsAppSettingsView />);
    await user.click(screen.getByRole("tab", { name: "tabs.deliveries" }));
    expect(new URLSearchParams(window.location.search).get("panel")).toBe("deliveries");
    expect(screen.getByText("deliveries")).toBeInTheDocument();
  });

  it("opens on the panel the URL names", () => {
    window.history.replaceState(null, "", "/settings/whatsapp?panel=templates");
    render(<WhatsAppSettingsView />);
    expect(screen.getByRole("tab", { name: "tabs.templates" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("saves the provider from the settings save bar once it has a change", () => {
    const { rerender } = render(<WhatsAppSettingsView />);
    expect(screen.queryByText("save bar")).not.toBeInTheDocument();
    provider.dirty = true;
    rerender(<WhatsAppSettingsView />);
    expect(screen.getByText("save bar")).toBeInTheDocument();
  });
});

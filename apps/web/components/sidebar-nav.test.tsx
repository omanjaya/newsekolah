import { TooltipProvider } from "@newsekolah/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarDays, ClipboardCheck } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import type { NavItem } from "../lib/navigation";
import { NAV_GROUP } from "../lib/navigation-groups";

import { GroupFlyout } from "./sidebar-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));

const ITEMS: NavItem[] = [
  { key: "schedule", labelKey: "nav.schedule", href: "/schedule", icon: CalendarDays },
  { key: "attendance", labelKey: "nav.attendance", href: "/attendance", icon: ClipboardCheck },
];

/** Past the flyout's 180ms close delay. */
const CLOSE_DELAY_PAST_MS = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderFlyout() {
  // The sidebar (and the app root) put every row under a tooltip provider.
  render(
    <TooltipProvider>
      <GroupFlyout group={NAV_GROUP.academic} items={ITEMS} activeHref={undefined} />
    </TooltipProvider>,
  );
  return screen.getByRole("button", { name: /app\.shell\.nav\.groupMenu/ });
}

describe("GroupFlyout", () => {
  it("keeps a hover-opened flyout open on the click that follows, and moves focus in", async () => {
    const user = userEvent.setup();
    const trigger = renderFlyout();

    await user.hover(trigger);
    expect(trigger).toHaveAttribute("data-state", "open");
    // Hover does not pull focus away from where the reader was.
    expect(screen.getByRole("link", { name: "nav.schedule" })).not.toHaveFocus();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("data-state", "open");
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "nav.schedule" })).toHaveFocus();
    });

    // A second click toggles it shut, as on a flyout a click opened.
    await user.click(trigger);
    expect(trigger).toHaveAttribute("data-state", "closed");
  });

  // A press on a hover-opened trigger that never becomes a click (dragged
  // off, released elsewhere) must not leave the keyboard toggle swallowed.
  it("still toggles from the keyboard after a press that never clicked", async () => {
    const user = userEvent.setup();
    const trigger = renderFlyout();

    await user.hover(trigger);
    fireEvent.pointerDown(trigger);
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("data-state", "closed");

    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("data-state", "open");
  });

  it("forgets the press when the pointer leaves before the click", async () => {
    const user = userEvent.setup();
    const trigger = renderFlyout();

    await user.hover(trigger);
    fireEvent.pointerDown(trigger);
    fireEvent.pointerLeave(trigger);
    // A click with no pointerdown of its own (assistive tech, a synthetic
    // activation) toggles as usual.
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("data-state", "closed");
  });

  // Radix focused the panel itself, which shows no ring (audit r3-n12).
  it("opens from the keyboard onto its first page, and Escape returns to the trigger", async () => {
    const user = userEvent.setup();
    const trigger = renderFlyout();

    trigger.focus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("data-state", "open");
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "nav.schedule" })).toHaveFocus();
    });

    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("data-state", "closed");
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  // A tap fires compatibility mouseenter and mouseleave around its click;
  // taken as a hover, they opened a peek and closed it 180ms later
  // (audit r3-n10).
  it("opens on a tap and stays open", async () => {
    const trigger = renderFlyout();

    fireEvent.pointerEnter(trigger, { pointerType: "touch" });
    fireEvent.pointerDown(trigger, { pointerType: "touch" });
    fireEvent.pointerUp(trigger, { pointerType: "touch" });
    fireEvent.pointerLeave(trigger, { pointerType: "touch" });
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseDown(trigger);
    fireEvent.mouseUp(trigger);
    fireEvent.click(trigger);
    fireEvent.mouseLeave(trigger);

    await sleep(CLOSE_DELAY_PAST_MS);
    expect(trigger).toHaveAttribute("data-state", "open");
    expect(screen.getByRole("link", { name: "nav.schedule" })).toHaveFocus();
  });

  // The click-opened panel kept the hover-only close on pointer leave
  // (audit r3-n11).
  it("keeps a clicked-open flyout open when the mouse moves away", async () => {
    const user = userEvent.setup();
    const trigger = renderFlyout();

    await user.click(trigger);
    await user.unhover(trigger);
    await sleep(CLOSE_DELAY_PAST_MS);

    expect(trigger).toHaveAttribute("data-state", "open");
    expect(screen.getByRole("link", { name: "nav.schedule" })).toHaveFocus();
  });

  it("closes a hover peek once the mouse moves away", async () => {
    const user = userEvent.setup();
    const trigger = renderFlyout();

    await user.hover(trigger);
    expect(trigger).toHaveAttribute("data-state", "open");
    await user.unhover(trigger);
    await waitFor(() => {
      expect(trigger).toHaveAttribute("data-state", "closed");
    });
  });

  it("leaves the base focus ring on its rows", async () => {
    const user = userEvent.setup();
    const trigger = renderFlyout();
    expect(trigger).not.toHaveClass("outline-none");

    await user.hover(trigger);
    expect(screen.getByRole("link", { name: "nav.schedule" })).not.toHaveClass("outline-none");
  });
});

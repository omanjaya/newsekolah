import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent as ReactMouseEvent, ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { useUnsavedChangesProtection } from "../lib/navigation/use-unsaved-changes-protection";

import { UnsavedChangesDialog } from "./unsaved-changes-dialog";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

/** An editor with unsaved changes and a link that routes the way next/link does. */
function Editor({ onNavigate }: { onNavigate: () => void }): ReactElement {
  useUnsavedChangesProtection(true, "Unsaved scores will be lost. Continue?");
  return (
    <a
      href="/next"
      onClick={(event: ReactMouseEvent) => {
        if (event.defaultPrevented) return;
        event.preventDefault();
        onNavigate();
      }}
    >
      Next
    </a>
  );
}

function renderEditor() {
  const onNavigate = vi.fn();
  render(
    <>
      <UnsavedChangesDialog />
      <Editor onNavigate={onNavigate} />
    </>,
  );
  return onNavigate;
}

describe("UnsavedChangesDialog", () => {
  it("asks in a dialog before a link leaves an editor with unsaved changes", async () => {
    const user = userEvent.setup();
    const onNavigate = renderEditor();

    await user.click(screen.getByRole("link", { name: "Next" }));

    const dialog = await screen.findByRole("dialog", { name: "title" });
    expect(dialog).toHaveAccessibleDescription("Unsaved scores will be lost. Continue?");
    // Focus opens on the way out that keeps the changes.
    expect(screen.getByRole("button", { name: "Batal" })).toHaveFocus();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("follows the link once the person chooses to leave", async () => {
    const user = userEvent.setup();
    const onNavigate = renderEditor();

    await user.click(screen.getByRole("link", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "Lanjutkan" }));

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("keeps the person on the page when they cancel", async () => {
    const user = userEvent.setup();
    const onNavigate = renderEditor();

    await user.click(screen.getByRole("link", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: "Batal" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

import type * as UiModule from "@newsekolah/ui";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GroupSizeLimitPanel } from "./group-size-limit-panel";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: mocks.success, error: mocks.error }) };
});
vi.mock("../api", () => ({
  useGroupSizeLimitQuery: () => ({ data: { limit: 15 }, isLoading: false }),
  useSetGroupSizeLimitMutation: () => ({ mutate: mocks.mutate, isPending: false }),
}));

describe("GroupSizeLimitPanel", () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.success.mockReset();
  });

  it("closes its dialog once the limit is saved", async () => {
    // The toast said "saved" while the dialog stayed open.
    mocks.mutate.mockImplementation((_limit: number, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    const onDone = vi.fn();
    render(<GroupSizeLimitPanel onDone={onDone} />);

    const input = screen.getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "16");
    await userEvent.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
    expect(mocks.mutate.mock.calls[0]?.[0]).toBe(16);
    expect(mocks.success).toHaveBeenCalledWith("saved");
  });

  it("stays open when the save fails", async () => {
    mocks.mutate.mockImplementation((_limit: number, opts: { onError: (e: unknown) => void }) => {
      opts.onError(new Error("offline"));
    });
    const onDone = vi.fn();
    render(<GroupSizeLimitPanel onDone={onDone} />);

    const input = screen.getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "16");
    await userEvent.click(screen.getByRole("button", { name: "submit" }));

    expect(onDone).not.toHaveBeenCalled();
  });

  it("cancels back out of the dialog", async () => {
    const onDone = vi.fn();
    render(<GroupSizeLimitPanel onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

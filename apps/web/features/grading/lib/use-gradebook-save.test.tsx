import type * as UiModule from "@newsekolah/ui";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Edits } from "../components/gradebook-types";

import { useGradebookSave } from "./use-gradebook-save";

const { mutateAsync, toast } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../api", () => ({
  useSaveComponentScoresMutation: () => ({ mutateAsync }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => toast };
});

function useHarness(initial: Edits) {
  const [edits, setEdits] = useState<Edits>(initial);
  const save = useGradebookSave(null, "class-1:subject-1:term-1", edits, setEdits);
  return { edits, save };
}

beforeEach(() => {
  mutateAsync.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("useGradebookSave", () => {
  it("sends a cleared cell as a null score and clears the pending edit", async () => {
    mutateAsync.mockResolvedValue(undefined);
    const { result } = renderHook(() => useHarness({ c1: { s1: "" } }));

    act(() => {
      result.current.save.saveColumn("c1");
    });

    await waitFor(() => {
      expect(result.current.edits).toEqual({ c1: {} });
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      componentId: "c1",
      entries: [{ student_user_id: "s1", score: null }],
    });
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("reads a comma decimal and sends it as a number", async () => {
    mutateAsync.mockResolvedValue(undefined);
    const { result } = renderHook(() => useHarness({ c1: { s1: "78,5", s2: "91.25" } }));

    act(() => {
      result.current.save.saveAll();
    });

    await waitFor(() => {
      expect(result.current.edits).toEqual({ c1: {} });
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      componentId: "c1",
      entries: [
        { student_user_id: "s1", score: 78.5 },
        { student_user_id: "s2", score: 91.25 },
      ],
    });
  });
});

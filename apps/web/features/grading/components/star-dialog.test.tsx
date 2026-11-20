import type * as UiModule from "@newsekolah/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const { mutateAsync, ledger } = vi.hoisted(() => {
  const state: { data: unknown; isLoading: boolean; isError: boolean; refetch: () => void } = {
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
  return { mutateAsync: vi.fn(), ledger: state };
});
const lookup = vi.hoisted(() => ({ isLoading: false, isError: false, known: true }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../api", () => ({
  // `isPending` stays false the whole time: TanStack Query only reports it
  // after a batched notification and a re-render, so a fast double click
  // never sees it set. The guard must hold without it.
  useGiveStarMutation: () => ({ mutateAsync, isPending: false }),
  useStarLedgerQuery: () => ledger,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../reference/directory-names", () => ({
  useDirectoryLookup: () => ({
    names:
      lookup.known && !lookup.isLoading && !lookup.isError
        ? new Map([["t1", { id: "t1", name: "Guru Contoh", username: "guru" }]])
        : new Map(),
    isLoading: lookup.isLoading,
    isError: lookup.isError,
    isSuccess: !lookup.isLoading && !lookup.isError,
    error: undefined,
    refetch: vi.fn(),
  }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { StarDialog } from "./star-dialog";

beforeAll(() => {
  // The segmented control measures its options.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
});

function renderDialog(currentBalance: number | null) {
  render(
    <StarDialog
      onOpenChange={vi.fn()}
      studentId="s1"
      studentName="Ani"
      classId="class-1"
      currentBalance={currentBalance}
    />,
  );
}

afterEach(() => {
  cleanup();
  mutateAsync.mockReset();
  ledger.data = undefined;
  lookup.isLoading = false;
  lookup.isError = false;
  lookup.known = true;
});

describe("StarDialog balance line", () => {
  it("shows a loaded balance", () => {
    renderDialog(4);
    expect(screen.getByText('currentBalance:{"count":4}')).toBeInTheDocument();
  });

  it("says the balance is unknown while it is, never a false zero", () => {
    renderDialog(null);
    expect(screen.getByText("currentBalanceUnknown")).toBeInTheDocument();
    expect(screen.queryByText(/currentBalance:/)).not.toBeInTheDocument();
  });
});

describe("StarDialog submit", () => {
  it("records one award for a double click, before any re-render", async () => {
    let settle: () => void = () => undefined;
    mutateAsync.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    renderDialog(4);
    const save = screen.getByRole("button", { name: "save" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    settle();
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(1);
    });
  });
});

const twoEvents = {
  balance: 2,
  data: [
    {
      id: "e2",
      student_user_id: "s1",
      class_id: "class-1",
      teacher_user_id: "t1",
      delta: -1,
      note: "",
      visible_to_student: true,
      created_at: "2026-11-20T03:40:00Z",
    },
    {
      id: "e1",
      student_user_id: "s1",
      class_id: "class-1",
      teacher_user_id: "t1",
      delta: 3,
      note: "Aktif bertanya saat praktikum titrasi",
      visible_to_student: true,
      created_at: "2026-11-20T03:35:00Z",
    },
  ],
};

describe("StarDialog history", () => {
  it("lists each award and deduction with its teacher and note", () => {
    ledger.data = twoEvents;
    renderDialog(2);
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText('given:{"count":3,"teacher":"Guru Contoh"}')).toBeInTheDocument();
    expect(screen.getByText('taken:{"count":1,"teacher":"Guru Contoh"}')).toBeInTheDocument();
    expect(screen.getByText("Aktif bertanya saat praktikum titrasi")).toBeInTheDocument();
  });

  it("does not blame an unknown teacher while the names are still loading", () => {
    ledger.data = twoEvents;
    lookup.isLoading = true;
    renderDialog(2);
    expect(screen.getByText('givenCount:{"count":3}')).toBeInTheDocument();
    expect(screen.queryByText(/unknownTeacher/)).not.toBeInTheDocument();
  });

  it("uses a neutral label when the name lookup fails", () => {
    ledger.data = twoEvents;
    lookup.isError = true;
    renderDialog(2);
    expect(
      screen.getByText('given:{"count":3,"teacher":"teacherUnavailable"}'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/unknownTeacher/)).not.toBeInTheDocument();
  });

  it("names an unknown teacher only once the lookup found no such person", () => {
    ledger.data = twoEvents;
    lookup.known = false;
    renderDialog(2);
    expect(screen.getByText('given:{"count":3,"teacher":"unknownTeacher"}')).toBeInTheDocument();
  });

  it("says so when the student has no star history yet", () => {
    ledger.data = { balance: 0, data: [] };
    renderDialog(0);
    expect(screen.getByText("empty")).toBeInTheDocument();
  });
});

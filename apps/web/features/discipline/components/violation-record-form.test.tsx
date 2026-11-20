import { ApiError } from "@newsekolah/api-client";
import type * as UiModule from "@newsekolah/ui";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  record: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  const people = [
    { id: "s1", name: "Sari" },
    { id: "s2", name: "Budi" },
    { id: "s3", name: "Tono" },
  ];
  return { ...directoryNamesStub(people), useDirectorySearch: mocks.search };
});
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../api", () => ({
  useRecordViolationMutation: () => ({ mutateAsync: mocks.record, isPending: false }),
  useRefreshDiscipline: () => mocks.refresh,
  useViolationTypesQuery: () => ({
    data: { data: [{ id: "type-1", name: "Terlambat", points: 5, is_active: true }] },
  }),
}));
vi.mock("../api-violation-extras", () => ({
  usePointsPreviewQuery: () => ({ data: undefined }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: mocks.toastError }) };
});

import { ViolationRecordForm } from "./violation-record-form";

beforeAll(() => {
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search.mockReturnValue({
    data: [
      { id: "s1", name: "Sari", username: "sari" },
      { id: "s2", name: "Budi", username: "budi" },
      { id: "s3", name: "Tono", username: "tono" },
    ],
    isFetching: false,
  });
  mocks.record.mockResolvedValue({ record: { student_user_id: "s1" }, due_levels: [] });
});

describe("ViolationRecordForm student search", () => {
  it("asks the server for a short page of students instead of filtering a loaded roster", () => {
    render(<ViolationRecordForm onDone={vi.fn()} />);

    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ profileKind: "student", query: "", limit: 30 }),
    );
    expect(screen.getByText("Sari")).toBeInTheDocument();
    expect(screen.getByText("Budi")).toBeInTheDocument();
  });

  it("searches after typing, then records the picked students one by one", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ViolationRecordForm onDone={onDone} />);

    await user.type(screen.getByRole("searchbox", { name: "studentSearchPlaceholder" }), "sar");
    await waitFor(() => {
      expect(mocks.search).toHaveBeenLastCalledWith(expect.objectContaining({ query: "sar" }));
    });

    await user.click(screen.getAllByRole("checkbox").at(0) ?? document.body);
    // The picked student shows as a removable chip.
    expect(screen.getByRole("button", { name: /removeStudent.*Sari/ })).toHaveTextContent("Sari");
    await user.click(screen.getByRole("checkbox", { name: /Terlambat/ }));
    await user.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(mocks.record).toHaveBeenCalledWith(
        expect.objectContaining({ student_user_id: "s1", violation_type_ids: ["type-1"] }),
      );
    });
    expect(onDone).toHaveBeenCalled();
  });
});

describe("ViolationRecordForm date", () => {
  it("defaults to the school's calendar day, not the UTC one", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 20:00 UTC on 25 Sep is already 03:00 on 26 Sep in Jakarta.
    vi.setSystemTime(new Date("2026-09-25T20:00:00Z"));
    try {
      const { container } = render(<ViolationRecordForm onDone={vi.fn()} />);
      const input = container.querySelector<HTMLInputElement>('input[name="occurred_on"]');
      expect(input?.value).toBe("2026-09-26");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ViolationRecordForm batch that fails part-way", () => {
  it("keeps saved students out of the retry and reports who was recorded", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const sariResult = { record: { student_user_id: "s1" }, total_points: 30, due_levels: [] };
    const budiResult = { record: { student_user_id: "s2" }, total_points: 5, due_levels: [] };
    mocks.record
      .mockResolvedValueOnce(sariResult)
      .mockRejectedValueOnce(new ApiError({ status: 500, code: "INTERNAL", message: "boom" }))
      .mockResolvedValueOnce(budiResult);
    render(<ViolationRecordForm onDone={onDone} />);

    await user.click(screen.getByRole("checkbox", { name: /Sari/ }));
    await user.click(screen.getByRole("checkbox", { name: /Budi/ }));
    await user.click(screen.getByRole("checkbox", { name: /Terlambat/ }));
    await user.click(screen.getByRole("button", { name: /submit/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/partial.saved.*Sari/);
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    // Sari left the selection; only Budi is still picked.
    expect(screen.queryByRole("button", { name: /removeStudent.*Sari/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /removeStudent.*Budi/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /submit/ }));

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith([sariResult, budiResult]);
    });
    expect(mocks.record).toHaveBeenCalledTimes(3);
    expect(
      mocks.record.mock.calls.map(
        ([body]) => (body as { student_user_id: string }).student_user_id,
      ),
    ).toEqual(["s1", "s2", "s2"]);
  });

  it("keeps naming every saved student across failed retries, with the latest error", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const sariResult = { record: { student_user_id: "s1" }, total_points: 30, due_levels: [] };
    const budiResult = { record: { student_user_id: "s2" }, total_points: 5, due_levels: [] };
    mocks.record
      // First attempt: Sari saved, Budi fails.
      .mockResolvedValueOnce(sariResult)
      .mockRejectedValueOnce(new ApiError({ status: 500, code: "INTERNAL", message: "boom" }))
      // Second attempt fails on its first remaining student.
      .mockRejectedValueOnce(new ApiError({ status: 503, code: "UNAVAILABLE", message: "down" }))
      // Third attempt: Budi saved, Tono fails.
      .mockResolvedValueOnce(budiResult)
      .mockRejectedValueOnce(new ApiError({ status: 500, code: "INTERNAL", message: "boom" }));
    render(<ViolationRecordForm onDone={onDone} />);

    await user.click(screen.getByRole("checkbox", { name: /Sari/ }));
    await user.click(screen.getByRole("checkbox", { name: /Budi/ }));
    await user.click(screen.getByRole("checkbox", { name: /Tono/ }));
    await user.click(screen.getByRole("checkbox", { name: /Terlambat/ }));
    await user.click(screen.getByRole("button", { name: /submit/ }));

    let alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/partial.title \{"count":1\}/);
    expect(alert).toHaveTextContent("INTERNAL");

    await user.click(screen.getByRole("button", { name: /submit/ }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("UNAVAILABLE");
    });
    alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/partial.saved.*Sari/);
    expect(alert).not.toHaveTextContent("INTERNAL");
    expect(mocks.toastError).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /submit/ }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/partial.title \{"count":2\}/);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/partial.saved.*Sari, Budi/);
    expect(screen.getByRole("alert")).toHaveTextContent("INTERNAL");
    expect(onDone).not.toHaveBeenCalled();
  });
});

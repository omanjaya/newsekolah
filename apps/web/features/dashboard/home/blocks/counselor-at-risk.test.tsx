import { render, renderHook, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import analytics from "../../../../messages/features/analytics.id.json";
import dashboardDuty from "../../../../messages/features/dashboardDuty.id.json";
import type { Me } from "../types";

import { useCounselorBlock } from "./counselor";

vi.mock("../../../permits/api", () => ({
  useLeaveReviewQueueQuery: () => ({ isLoading: false, isError: false, data: undefined }),
}));
vi.mock("../../../discipline/api", () => ({
  useSPCandidatesQuery: () => ({ isLoading: false, isError: false, data: undefined }),
}));
vi.mock("../../../analytics/api", () => ({
  useAtRiskStudentsQuery: () => ({
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    data: {
      data: [
        { student_user_id: "s1", class_id: "c1", score: 52, level: "watch" },
        { student_user_id: "s2", class_id: "c1", score: 40, level: "watch" },
        { student_user_id: "s3", class_id: "c1", score: 0, level: "none" },
      ],
    },
  }),
}));
vi.mock("../../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "c1", name: "X-A" }] } }),
  useLookup: (items: { id: string }[] | undefined) =>
    new Map((items ?? []).map((item) => [item.id, item])),
}));
vi.mock("../../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../../test/directory-names-stub");
  return directoryNamesStub([
    { id: "s1", name: "Siswa Contoh" },
    { id: "s2", name: "Murid Pindah" },
  ]);
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale="id"
      messages={{ app: { analytics, dashboardDuty } }}
      onError={(error) => {
        throw error;
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

describe("counselor home card for students needing attention", () => {
  it("never calls Siaga students berisiko, and counts them per level as /analytics does", () => {
    const me = { permissions: ["view_early_warning"] } as unknown as Me;
    const { result } = renderHook(() => useCounselorBlock(me, true), { wrapper });
    const { container } = render(<>{result.current.main.map((slot) => slot.node)}</>, {
      wrapper,
    });

    expect(screen.getByRole("heading", { name: "Siswa perlu perhatian" })).toBeInTheDocument();
    expect(screen.getByText("0 berisiko, 2 siaga")).toBeInTheDocument();
    expect(screen.getAllByText("Siaga")).toHaveLength(2);
    // "berisiko" appears only as the at-risk count, which is zero here.
    expect(container.textContent.match(/berisiko/gi)).toEqual(["berisiko"]);
  });
});

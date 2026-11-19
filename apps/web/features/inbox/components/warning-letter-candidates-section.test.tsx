import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issue: vi.fn(),
  mutation: { isPending: false, variables: undefined as { student_user_id: string } | undefined },
}));

vi.mock("next-intl", () => ({
  useTranslations:
    () =>
    (key: string, values?: Record<string, unknown>): string =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../discipline/api", () => ({
  useDisciplinePolicyQuery: () => ({
    data: { levels: [{ level: 1, label: "SP1", min_points: 25 }] },
    isLoading: false,
    isError: false,
  }),
  useSPCandidatesQuery: () => ({
    data: {
      data: [
        {
          student_user_id: "s-1",
          student_name: "Siswa Satu",
          nis: "001",
          class_name: "X-A",
          total_points: 30,
          issued_levels: [],
        },
        {
          student_user_id: "s-2",
          student_name: "Siswa Dua",
          nis: "002",
          class_name: "X-B",
          total_points: 40,
          issued_levels: [],
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
  useIssueWarningLetterMutation: () => ({ mutate: mocks.issue, ...mocks.mutation }),
}));

import { WarningLetterCandidatesSection } from "./warning-letter-candidates-section";

beforeEach(() => {
  mocks.issue.mockReset();
  mocks.mutation = { isPending: false, variables: undefined };
});

describe("WarningLetterCandidatesSection", () => {
  it("asks for confirmation before issuing a letter", async () => {
    const user = userEvent.setup();
    render(<WarningLetterCandidatesSection />);

    const [first] = screen.getAllByRole("button", { name: "issue SP1" });
    if (!first) throw new Error("no issue button");
    await user.click(first);
    expect(mocks.issue).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("issueConfirm.title SP1 Siswa Satu")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "issue SP1" }));

    expect(mocks.issue).toHaveBeenCalledWith(
      { student_user_id: "s-1", level: 1 },
      expect.any(Object),
    );
  });

  it("shows the spinner only on the row being issued", () => {
    mocks.mutation = { isPending: true, variables: { student_user_id: "s-2" } };
    render(<WarningLetterCandidatesSection />);

    const [first, second] = screen.getAllByRole("button", { name: /issue SP1/ });
    expect(first).not.toHaveAttribute("aria-busy", "true");
    expect(second).toHaveAttribute("aria-busy", "true");
  });
});

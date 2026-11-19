import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: {
    names: new Map<string, { id: string; name: string; nis?: string }>(),
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  },
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => false }));
vi.mock("../../reference/directory-names", () => ({ useDirectoryLookup: () => mocks.lookup }));
vi.mock("./student-discipline-panel", () => ({ StudentDisciplinePanel: () => null }));
vi.mock("./use-open-student-discipline-report", () => ({
  useOpenStudentDisciplineReport: () => ({ pending: false, open: vi.fn() }),
}));
vi.mock("./violation-record-form", () => ({ ViolationRecordForm: () => null }));

import { StudentDisciplineView } from "./student-discipline-view";

beforeEach(() => {
  mocks.lookup = {
    names: new Map(),
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  };
});

it("does not call the student unknown while the name is still loading", () => {
  mocks.lookup.isLoading = true;
  mocks.lookup.isSuccess = false;
  render(<StudentDisciplineView studentId="s1" />);

  expect(screen.queryByText("unknownStudent")).not.toBeInTheDocument();
});

it("titles the page with the student's name once it loads", () => {
  mocks.lookup.names.set("s1", { id: "s1", name: "Ayu Lestari", nis: "1001" });
  render(<StudentDisciplineView studentId="s1" />);

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ayu Lestari");
});

it("says the student is unknown only after the lookup settles without them", () => {
  render(<StudentDisciplineView studentId="s1" />);

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("unknownStudent");
  expect(screen.queryByText("nameLoadError")).not.toBeInTheDocument();
});

it("offers a retry when the name lookup fails", async () => {
  mocks.lookup.isError = true;
  mocks.lookup.isSuccess = false;
  const user = userEvent.setup();
  render(<StudentDisciplineView studentId="s1" />);

  expect(screen.getByText("nameLoadError")).toBeInTheDocument();
  expect(screen.queryByText("unknownStudent")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "retry" }));
  expect(mocks.lookup.refetch).toHaveBeenCalled();
});

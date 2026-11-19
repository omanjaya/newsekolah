import { ApiError } from "@newsekolah/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

interface Lookup {
  names: Map<string, { id: string; name: string; nis?: string; profile_kind?: string }>;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
  refetch: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted<{ lookup: Lookup }>(() => ({
  lookup: {
    names: new Map<string, { id: string; name: string; nis?: string; profile_kind?: string }>(),
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: undefined,
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
    error: undefined,
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
  mocks.lookup.names.set("s1", {
    id: "s1",
    name: "Ayu Lestari",
    nis: "1001",
    profile_kind: "student",
  });
  render(<StudentDisciplineView studentId="s1" />);

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ayu Lestari");
});

it("shows the not-found page once the lookup settles without the student", () => {
  render(<StudentDisciplineView studentId="00000000-0000-0000-0000-000000000000" />);

  expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "backToViolations" })).toHaveAttribute(
    "href",
    "/discipline/violations",
  );
  expect(screen.queryByText("nameLoadError")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "printReport" })).not.toBeInTheDocument();
});

it("shows the not-found page for a staff member's id, with no actions", () => {
  mocks.lookup.names.set("staff-1", { id: "staff-1", name: "Admin Contoh", profile_kind: "staff" });
  render(<StudentDisciplineView studentId="staff-1" />);

  expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
  expect(screen.queryByText("Admin Contoh")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "printReport" })).not.toBeInTheDocument();
});

it("treats a malformed id as a missing student, not a failed lookup", () => {
  mocks.lookup.isError = true;
  mocks.lookup.isSuccess = false;
  mocks.lookup.error = new ApiError({
    status: 400,
    code: "VALIDATION_FAILED",
    message: "invalid",
    details: [{ field: "ids", code: "INVALID_FORMAT" }],
  });
  render(<StudentDisciplineView studentId="abc" />);

  expect(screen.getByRole("heading", { name: "notFoundTitle" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "retry" })).not.toBeInTheDocument();
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

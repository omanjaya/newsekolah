import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../academic/api-master-data", () => ({
  useGradeLevelsQuery: () => ({ data: { data: [] } }),
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "class-7a", name: "7A" }] } }),
}));
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: () => new Map([["student-1", { id: "student-1", name: "Siswa Contoh" }]]),
}));
vi.mock("./student-picker", () => ({ StudentPicker: () => <div>Student picker</div> }));
vi.mock("../api", () => ({
  useActivityEventQuery: () => ({
    data: {
      participants: [
        { id: "p1", scope: "student", student_user_id: "student-1" },
        { id: "p2", scope: "class", class_id: "class-7a" },
      ],
    },
    isLoading: false,
    isError: false,
  }),
  useAddActivityParticipantMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveActivityParticipantMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ActivityParticipants } from "./activity-participants";

describe("ActivityParticipants", () => {
  it("lists the participants without any write control for a reader", () => {
    render(<ActivityParticipants activityId="event-1" canManage={false} />);

    expect(screen.getByText("Siswa Contoh")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "add" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "remove" })).not.toBeInTheDocument();
    expect(screen.queryByText("Student picker")).not.toBeInTheDocument();
  });

  it("offers the add form and a remove button per participant to a manager", () => {
    render(<ActivityParticipants activityId="event-1" canManage />);

    expect(screen.getByRole("button", { name: "add" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "remove" })).toHaveLength(2);
  });
});

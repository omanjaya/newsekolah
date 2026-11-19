import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
const { useClassesQuery, useGradeLevelsQuery, participants } = vi.hoisted(() => ({
  useClassesQuery: vi.fn((enabled: boolean) => ({
    data: enabled ? { data: [{ id: "class-7a", name: "7A" }] } : undefined,
  })),
  useGradeLevelsQuery: vi.fn((_enabled: boolean) => ({ data: { data: [] } })),
  participants: {
    current: [
      { id: "p1", scope: "student", student_user_id: "student-1" },
      { id: "p2", scope: "class", class_id: "class-7a" },
    ] as { id: string; scope: string; student_user_id?: string; class_id?: string }[],
  },
}));
vi.mock("../../reference/api", () => ({ useClassesQuery, useGradeLevelsQuery }));
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: () => new Map([["student-1", { id: "student-1", name: "Siswa Contoh" }]]),
}));
vi.mock("./student-picker", () => ({ StudentPicker: () => <div>Student picker</div> }));
vi.mock("../api", () => ({
  useActivityEventQuery: () => ({
    data: { participants: participants.current },
    isLoading: false,
    isError: false,
  }),
  useAddActivityParticipantMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveActivityParticipantMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ActivityParticipants } from "./activity-participants";

describe("ActivityParticipants", () => {
  beforeEach(() => {
    useClassesQuery.mockClear();
    useGradeLevelsQuery.mockClear();
    participants.current = [
      { id: "p1", scope: "student", student_user_id: "student-1" },
      { id: "p2", scope: "class", class_id: "class-7a" },
    ];
  });

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

  it("fetches only the lists a reader's participants are named from", () => {
    render(<ActivityParticipants activityId="event-1" canManage={false} />);

    expect(screen.getAllByRole("listitem")[1]).toHaveTextContent(/7a/i);
    expect(useClassesQuery).toHaveBeenLastCalledWith(true);
    expect(useGradeLevelsQuery).toHaveBeenLastCalledWith(false);
  });

  it("fetches neither list for a reader whose participants are all students", () => {
    participants.current = [{ id: "p1", scope: "student", student_user_id: "student-1" }];
    render(<ActivityParticipants activityId="event-1" canManage={false} />);

    expect(useClassesQuery).toHaveBeenLastCalledWith(false);
    expect(useGradeLevelsQuery).toHaveBeenLastCalledWith(false);
  });

  it("fetches both lists for a manager's add form", () => {
    participants.current = [];
    render(<ActivityParticipants activityId="event-1" canManage />);

    expect(useClassesQuery).toHaveBeenLastCalledWith(true);
    expect(useGradeLevelsQuery).toHaveBeenLastCalledWith(true);
  });
});

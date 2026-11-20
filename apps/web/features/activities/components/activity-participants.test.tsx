import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

beforeAll(() => {
  // Radix Select probes pointer capture and scrolls the active option into view.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

describe("ActivityParticipants", () => {
  beforeEach(() => {
    useClassesQuery.mockReset();
    useClassesQuery.mockImplementation((enabled: boolean) => ({
      data: enabled ? { data: [{ id: "class-7a", name: "7A" }] } : undefined,
    }));
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

  it("shows a class name as the school wrote it, not re-cased like a person", () => {
    useClassesQuery.mockImplementation((enabled: boolean) => ({
      data: enabled
        ? {
            data: [
              { id: "class-7a", name: "XII-B" },
              { id: "class-x", name: "X-A" },
            ],
          }
        : undefined,
    }));
    render(<ActivityParticipants activityId="event-1" canManage={false} />);

    expect(screen.getByText("XII-B")).toBeInTheDocument();
    expect(screen.queryByText("Xii-b")).not.toBeInTheDocument();
  });

  it("leaves a class already taking part out of the class choices", async () => {
    useClassesQuery.mockImplementation((enabled: boolean) => ({
      data: enabled
        ? {
            data: [
              { id: "class-7a", name: "7A" },
              { id: "class-7b", name: "7B" },
            ],
          }
        : undefined,
    }));
    render(<ActivityParticipants activityId="event-1" canManage />);

    await userEvent.click(screen.getByRole("combobox", { name: "scope" }));
    await userEvent.click(await screen.findByRole("option", { name: "class" }));
    await userEvent.click(screen.getByRole("combobox", { name: "choose" }));
    expect(await screen.findByRole("option", { name: "7B" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "7A" })).not.toBeInTheDocument();
  });
});

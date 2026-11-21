import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { SubstitutionsView } from "./substitutions-view";

const requests = vi.hoisted(() => ({
  incoming: [] as unknown[],
  outgoing: [] as unknown[],
  all: [] as unknown[],
}));
const access = vi.hoisted(() => ({ permissions: [] as string[], roles: [{ slug: "teacher" }] }));
const mutations = vi.hoisted(() => ({ respond: vi.fn(), cancel: vi.fn() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useFormatter: () => ({
    dateTime: (value: Date, options?: { year?: string }) =>
      options?.year ? value.toISOString().slice(0, 10) : "Sabtu, 14 November",
  }),
  // A date a message names is kept, so a test can tell which one it says.
  useTranslations: () => (key: string, values?: { date?: string }) =>
    values?.date ? `${key} [${values.date}]` : key,
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: { id: "me", roles: access.roles, tenant: { timezone: "Asia/Makassar" } },
  }),
  useCan: (permission: string) => access.permissions.includes(permission),
}));
vi.mock("../../../lib/tenant-date", () => ({ todayInZone: () => "2026-11-14" }));
vi.mock("../../reference/api", () => ({
  useAllPeriodsQuery: () => ({ data: { data: [] } }),
  useClassesQuery: () => ({ data: { data: [{ id: "class-1", name: "X-A" }] } }),
  useSubjectsQuery: () => ({ data: { data: [{ id: "subject-1", name: "Matematika" }] } }),
  useLookup: (items: { id: string }[] | undefined) =>
    new Map((items ?? []).map((item) => [item.id, item])),
}));
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: () =>
    new Map([
      ["teacher-2", { name: "Guru Dua" }],
      ["teacher-3", { name: "Guru Tiga" }],
    ]),
}));
vi.mock("./request-form", () => ({ RequestForm: () => null }));
vi.mock("../api", () => ({
  useSubstitutionsQuery: (direction: "incoming" | "outgoing" | "all") => ({
    data: { data: requests[direction] },
    isLoading: false,
    isError: false,
  }),
  useRespondSubstitutionMutation: () => ({ mutate: mutations.respond, isPending: false }),
  useCancelSubstitutionMutation: () => ({ mutate: mutations.cancel, isPending: false }),
}));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/substitutions");
  requests.incoming = [];
  requests.outgoing = [];
  requests.all = [];
  access.permissions = [];
  access.roles = [{ slug: "teacher" }];
  mutations.respond.mockReset();
  mutations.cancel.mockReset();
});

function request(id: string, status: string) {
  return {
    id,
    status,
    date: "2026-11-16",
    class_id: "class-1",
    subject_id: "subject-1",
    requester_user_id: "teacher-2",
    substitute_user_id: "me",
  };
}

/** A request this teacher sent. */
function outgoingRequest(id: string, status: string) {
  return { ...request(id, status), requester_user_id: "me", substitute_user_id: "teacher-2" };
}

it("counts the requests still waiting on this teacher on the incoming switch", () => {
  requests.incoming = [request("r1", "pending"), request("r2", "accepted")];
  render(<SubstitutionsView />);

  expect(screen.getByRole("radio", { name: /incoming/ })).toHaveTextContent("1");
  expect(screen.getByTestId("substitution-r1")).toHaveTextContent("Matematika · X-A");
  expect(screen.getByRole("button", { name: "accept" })).toBeInTheDocument();
});

it("repeats the request only on the empty list of one's own requests", async () => {
  const user = userEvent.setup();
  render(<SubstitutionsView />);

  // While the incoming list is empty the header's request is the one way in.
  expect(screen.getByText("emptyIncomingBody")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "request" })).toHaveLength(1);

  await user.click(screen.getByRole("radio", { name: /outgoing/ }));
  expect(screen.getByText("emptyOutgoingBody")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "request" })).toHaveLength(2);
});

it("colours a declined request like every other refusal", () => {
  requests.incoming = [request("r1", "rejected")];
  render(<SubstitutionsView />);

  const badge = screen.getByText("status.rejected");
  expect(badge.closest("[data-status]")).toHaveAttribute("data-status", "rejected");
});

it("asks before declining and sends the optional reason as the note", async () => {
  const user = userEvent.setup();
  requests.incoming = [request("r1", "pending")];
  render(<SubstitutionsView />);

  await user.click(screen.getByRole("button", { name: "reject" }));
  expect(mutations.respond).not.toHaveBeenCalled();

  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("rejectConfirm.title");
  await user.type(within(dialog).getByRole("textbox"), "  Ada rapat  ");
  await user.click(within(dialog).getByRole("button", { name: "rejectConfirm.confirm" }));

  expect(mutations.respond).toHaveBeenCalledWith(
    { id: "r1", accept: false, note: "Ada rapat" },
    expect.any(Object),
  );
});

it("accepts with one tap", async () => {
  const user = userEvent.setup();
  requests.incoming = [request("r1", "pending")];
  render(<SubstitutionsView />);

  await user.click(screen.getByRole("button", { name: "accept" }));
  expect(mutations.respond).toHaveBeenCalledWith({ id: "r1", accept: true }, expect.any(Object));
});

it("asks before cancelling one's own request", async () => {
  const user = userEvent.setup();
  requests.outgoing = [outgoingRequest("r1", "pending")];
  render(<SubstitutionsView />);

  await user.click(screen.getByRole("radio", { name: /outgoing/ }));
  await user.click(screen.getByRole("button", { name: "cancel" }));
  expect(mutations.cancel).not.toHaveBeenCalled();

  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "cancelConfirm.confirm" }));
  expect(mutations.cancel).toHaveBeenCalledWith("r1", expect.any(Object));
});

it("keeps the decline dialog and its reason open when declining fails", async () => {
  const user = userEvent.setup();
  requests.incoming = [request("r1", "pending")];
  mutations.respond.mockImplementation(
    (_vars, options: { onError?: (e: Error) => void; onSettled?: () => void }) => {
      options.onError?.(new Error("boom"));
      options.onSettled?.();
    },
  );
  render(<SubstitutionsView />);

  await user.click(screen.getByRole("button", { name: "reject" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByRole("textbox"), "Ada rapat");
  await user.click(within(dialog).getByRole("button", { name: "rejectConfirm.confirm" }));

  expect(mutations.respond).toHaveBeenCalledTimes(1);
  const stillOpen = screen.getByRole("dialog");
  expect(within(stillOpen).getByRole("textbox")).toHaveValue("Ada rapat");
  expect(within(stillOpen).getByRole("button", { name: "rejectConfirm.confirm" })).toBeEnabled();
});

it("keeps the cancel dialog open when cancelling fails", async () => {
  const user = userEvent.setup();
  requests.outgoing = [outgoingRequest("r1", "pending")];
  mutations.cancel.mockImplementation(
    (_id, options: { onError?: (e: Error) => void; onSettled?: () => void }) => {
      options.onError?.(new Error("boom"));
      options.onSettled?.();
    },
  );
  render(<SubstitutionsView />);

  await user.click(screen.getByRole("radio", { name: /outgoing/ }));
  await user.click(screen.getByRole("button", { name: "cancel" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "cancelConfirm.confirm" }));

  expect(mutations.cancel).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("offers the school-wide list only to a schedule manager", () => {
  render(<SubstitutionsView />);
  expect(screen.queryByRole("radio", { name: "all" })).not.toBeInTheDocument();
});

it("opens a non-teaching admin on every request in the school, naming both teachers", () => {
  access.permissions = ["manage_schedules"];
  access.roles = [{ slug: "admin" }];
  requests.all = [
    {
      ...request("r1", "pending"),
      requester_user_id: "teacher-2",
      substitute_user_id: "teacher-3",
    },
  ];
  render(<SubstitutionsView />);

  expect(screen.getByRole("radio", { name: "all" })).toBeChecked();
  const card = screen.getByTestId("substitution-r1");
  expect(card).toHaveTextContent("Matematika · X-A");
  expect(card).toHaveTextContent("fromTeacher: Guru Dua");
  expect(card).toHaveTextContent("toTeacher: Guru Tiga");
  // Only the two teachers answer it; the manager may only cancel it.
  expect(within(card).queryByRole("button", { name: "accept" })).not.toBeInTheDocument();
  expect(within(card).getByRole("button", { name: "release" })).toHaveTextContent("cancel");
});

/** A request between two other teachers, as the school-wide list shows it. */
function othersRequest(id: string, status: string, date = "2026-11-16") {
  return {
    ...request(id, status),
    date,
    requester_user_id: "teacher-2",
    substitute_user_id: "teacher-3",
  };
}

// A pending substitution weeks away held every change to its lesson back,
// and only the requesting teacher could withdraw it: the admin's card had
// no buttons at all.
it("lets a schedule manager cancel another teacher's request, after confirming", async () => {
  const user = userEvent.setup();
  access.permissions = ["manage_schedules"];
  access.roles = [{ slug: "admin" }];
  requests.all = [othersRequest("r1", "pending", "2027-03-01")];
  render(<SubstitutionsView />);

  await user.click(screen.getByRole("button", { name: "release" }));
  expect(mutations.cancel).not.toHaveBeenCalled();
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("releaseConfirm.title");
  expect(within(dialog).getByText("releaseConfirm.body")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "releaseConfirm.confirm" }));
  expect(mutations.cancel).toHaveBeenCalledWith("r1", expect.any(Object));
});

// Every manager cancel promised the timetable could then change earlier,
// even for a request on the lesson's first date or behind a later hold,
// where cancelling freed nothing. The promise, with its date, now comes
// only when the server says the request is what holds the change back.
it("promises an earlier change date only when cancelling frees one", async () => {
  const user = userEvent.setup();
  access.permissions = ["manage_schedules"];
  access.roles = [{ slug: "admin" }];
  requests.all = [
    { ...othersRequest("frees", "pending", "2027-03-01"), release_frees_from: "2026-11-16" },
    othersRequest("holds-nothing", "accepted", "2027-03-08"),
  ];
  render(<SubstitutionsView />);

  const open = async (id: string) => {
    await user.click(
      within(screen.getByTestId(`substitution-${id}`)).getByRole("button", { name: "release" }),
    );
    return screen.findByRole("dialog");
  };
  const freeing = await open("frees");
  expect(within(freeing).getByText("releaseConfirm.bodyFreeing [2026-11-16]")).toBeInTheDocument();
  expect(within(freeing).queryByText("releaseConfirm.body")).not.toBeInTheDocument();
  await user.click(within(freeing).getByRole("button", { name: "releaseConfirm.keep" }));

  const neutral = await open("holds-nothing");
  expect(within(neutral).getByText("releaseConfirm.body")).toBeInTheDocument();
  expect(within(neutral).queryByText(/releaseConfirm\.bodyFreeing/)).not.toBeInTheDocument();
});

it("offers the manager's cancel on accepted requests to come, never on past or closed ones", () => {
  access.permissions = ["manage_schedules"];
  access.roles = [{ slug: "admin" }];
  requests.all = [
    othersRequest("accepted", "accepted", "2026-11-14"),
    othersRequest("past", "accepted", "2026-11-13"),
    othersRequest("rejected", "rejected", "2026-11-20"),
    othersRequest("cancelled", "cancelled", "2026-11-20"),
  ];
  render(<SubstitutionsView />);

  const button = (id: string) =>
    within(screen.getByTestId(`substitution-${id}`)).queryByRole("button", { name: "release" });
  expect(button("accepted")).toBeInTheDocument();
  expect(button("past")).not.toBeInTheDocument();
  expect(button("rejected")).not.toBeInTheDocument();
  expect(button("cancelled")).not.toBeInTheDocument();
});

it("opens the school-wide list from the schedule editor's link, for a manager who teaches", () => {
  access.permissions = ["manage_schedules"];
  requests.all = [othersRequest("r1", "pending", "2027-03-01")];
  window.history.replaceState(null, "", "/substitutions?view=all");
  render(<SubstitutionsView />);

  expect(screen.getByRole("radio", { name: "all" })).toBeChecked();
  expect(screen.getByTestId("substitution-r1")).toBeInTheDocument();
});

it("ignores the school-wide link for a teacher who cannot see it", () => {
  requests.incoming = [request("r1", "pending")];
  window.history.replaceState(null, "", "/substitutions?view=all");
  render(<SubstitutionsView />);

  expect(screen.getByRole("radio", { name: /incoming/ })).toBeChecked();
  expect(screen.queryByRole("button", { name: "release" })).not.toBeInTheDocument();
});

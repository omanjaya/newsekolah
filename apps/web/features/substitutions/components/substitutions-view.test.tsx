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

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useFormatter: () => ({ dateTime: () => "Sabtu, 14 November" }),
  useTranslations: () => (key: string) => key,
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
  // Only the two teachers answer or withdraw it.
  expect(within(card).queryByRole("button")).not.toBeInTheDocument();
});

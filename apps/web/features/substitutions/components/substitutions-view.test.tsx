import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { SubstitutionsView } from "./substitutions-view";

const requests = vi.hoisted(() => ({
  incoming: [] as unknown[],
  outgoing: [] as unknown[],
}));

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
  useSession: () => ({ me: { tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../../lib/tenant-date", () => ({ todayInZone: () => "2026-11-14" }));
vi.mock("../../reference/api", () => ({
  useAllPeriodsQuery: () => ({ data: { data: [] } }),
  useClassesQuery: () => ({ data: { data: [{ id: "class-1", name: "X-A" }] } }),
  useSubjectsQuery: () => ({ data: { data: [{ id: "subject-1", name: "Matematika" }] } }),
  useLookup: (items: { id: string }[] | undefined) =>
    new Map((items ?? []).map((item) => [item.id, item])),
}));
vi.mock("../../reference/directory-names", () => ({ useDirectoryNames: () => new Map() }));
vi.mock("./request-form", () => ({ RequestForm: () => null }));
vi.mock("../api", () => ({
  useSubstitutionsQuery: (direction: "incoming" | "outgoing") => ({
    data: { data: requests[direction] },
    isLoading: false,
    isError: false,
  }),
  useRespondSubstitutionMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelSubstitutionMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(() => {
  cleanup();
  requests.incoming = [];
  requests.outgoing = [];
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

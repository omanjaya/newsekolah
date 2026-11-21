import { ApiError } from "@newsekolah/api-client";
import type * as UiModule from "@newsekolah/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, setAccessToken } from "../lib/api/access-token";
import { readDraft, writeDraft } from "../lib/drafts/draft-storage";
import { CLEAR_ACCESS_COOKIE_PATH } from "../lib/session/clear-server-access-cookie";
import type { Me } from "../lib/session/session-provider";
import en from "../messages/en.json";
import id from "../messages/id.json";

import { ImpersonationBanner } from "./impersonation-banner";

const replace = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());
const forgetAccessToken = vi.hoisted(() => vi.fn());

const teacher = vi.hoisted(
  () =>
    ({
      id: "teacher",
      name: "Teacher",
      username: "teacher",
      permissions: [],
      roles: [],
      tenant: { tenant_id: "school", timezone: "Asia/Makassar", locale: "id", name: "School" },
      must_change_password: false,
      impersonated_by: { user_id: "admin", name: "Admin" },
    }) as unknown as Me,
);

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
/** Every message the strip asked for, with its values. */
const translated = vi.hoisted(() => [] as { key: string; values?: Record<string, unknown> }[]);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    translated.push({ key, values });
    return key;
  },
  useLocale: () => "id",
}));
vi.mock("../lib/session/session-provider", () => ({ useSession: () => ({ me: teacher }) }));
vi.mock("../lib/api/client", () => ({
  useApiClient: () => ({ GET: get, POST: post, forgetAccessToken }),
}));
vi.mock("../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => `error.${code}`,
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ error: toastError, success: vi.fn() }) };
});

/** Whose drafts the impersonation writes, and the admin's own (lib/drafts/draft-owner.ts). */
const IMPERSONATED_OWNER = "school:teacher~admin";
const ADMIN_OWNER = "school:admin";

/** useRoleTestingQuery's key for this session (features/auth/role-testing-api.ts). */
const ROLE_STATUS_KEY = ["auth", "role-testing", "school", "teacher", "admin", "", "", ""];

/** A tab impersonating the teacher, holding what it read as the teacher. */
function renderStrip(options: { roleStatusKnown?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], teacher);
  client.setQueryData(["notifications", "unread-count"], { count: 2 });
  if (options.roleStatusKnown ?? true) {
    client.setQueryData(ROLE_STATUS_KEY, { available: false, active: false, roles: [] });
  }
  render(
    <QueryClientProvider client={client}>
      <ImpersonationBanner />
    </QueryClientProvider>,
  );
  return client;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  translated.length = 0;
  sessionStorage.clear();
  localStorage.clear();
  setAccessToken("teacher-token");
  fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe("ImpersonationBanner", () => {
  // The impersonation is still alive on the server after a failed stop:
  // the strip is the only sign of it and the only way out, so it stays.
  it("keeps the strip and its Stop button after a failed stop, and says why", async () => {
    post.mockRejectedValue(
      new ApiError({ status: 503, code: "SERVICE_UNAVAILABLE", message: "down" }),
    );
    writeDraft(IMPERSONATED_OWNER, "journal", "class-1", { text: "as the teacher" });
    const user = userEvent.setup();
    const client = renderStrip();

    await user.click(screen.getByRole("button", { name: "impersonationStop" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("error.SERVICE_UNAVAILABLE");
    });
    expect(screen.getByRole("button", { name: "impersonationStop" })).toBeEnabled();
    expect(screen.getByText("impersonation")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("teacher-token");
    expect(forgetAccessToken).not.toHaveBeenCalled();
    expect(client.getQueryData(["notifications", "unread-count"])).toEqual({ count: 2 });
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(readDraft(IMPERSONATED_OWNER, "journal", "class-1")).not.toBeNull();
  });

  it("lets the admin try again after a failed stop", async () => {
    post.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderStrip();

    await user.click(screen.getByRole("button", { name: "impersonationStop" }));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("error.UNKNOWN");
    });
    await user.click(screen.getByRole("button", { name: "impersonationStop" }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
    expect(post).toHaveBeenCalledTimes(2);
  });

  // The impersonation reached its fixed end or another tab stopped it
  // (401, once the API client's refresh on AUTH_SESSION_REVOKED failed), or
  // this tab holds a session that is not an impersonation (400, the retried
  // stop after a refresh that landed on another identity): nothing is left
  // to stop, and nothing went wrong that the admin did.
  it.each([
    { status: 401, code: "AUTH_SESSION_REVOKED" },
    { status: 400, code: "NOT_IMPERSONATING" },
  ])(
    "goes to the sign-in page without an error when the server answers $status $code",
    async ({ status, code }) => {
      post.mockRejectedValue(new ApiError({ status, code, message: code }));
      const user = userEvent.setup();
      const client = renderStrip();

      await user.click(screen.getByRole("button", { name: "impersonationStop" }));

      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith("/login");
      });
      expect(toastError).not.toHaveBeenCalled();
      expect(getAccessToken()).toBeNull();
      expect(forgetAccessToken).toHaveBeenCalledTimes(1);
      expect(client.getQueryData(["me"])).toBeUndefined();
      expect(client.getQueryData(["notifications", "unread-count"])).toBeUndefined();
    },
  );

  it("goes to the sign-in page with no token left once the server stopped the impersonation", async () => {
    post.mockResolvedValue(undefined);
    writeDraft(IMPERSONATED_OWNER, "journal", "class-1", { text: "as the teacher" });
    writeDraft(ADMIN_OWNER, "counseling", "new", { text: "the admin's own" });
    const user = userEvent.setup();
    const client = renderStrip();

    await user.click(screen.getByRole("button", { name: "impersonationStop" }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
    expect(post).toHaveBeenCalledWith("/v1/auth/impersonation/stop");
    expect(fetchMock).toHaveBeenCalledWith(CLEAR_ACCESS_COOKIE_PATH, expect.anything());
    expect(getAccessToken()).toBeNull();
    expect(forgetAccessToken).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["me"])).toBeUndefined();
    expect(toastError).not.toHaveBeenCalled();
    // Nobody is signed in here any more: an explicit sign-out forgets every draft.
    expect(readDraft(IMPERSONATED_OWNER, "journal", "class-1")).toBeNull();
    expect(readDraft(ADMIN_OWNER, "counseling", "new")).toBeNull();
  });

  it("returns the admin to their own dashboard when the server restored the admin's session", async () => {
    const admin = { ...teacher, id: "admin", name: "Admin", impersonated_by: undefined };
    post.mockResolvedValue({ access_token: "admin-token", user: admin });
    writeDraft(IMPERSONATED_OWNER, "journal", "class-1", { text: "as the teacher" });
    writeDraft(ADMIN_OWNER, "counseling", "new", { text: "the admin's own" });
    const user = userEvent.setup();
    const client = renderStrip();

    await user.click(screen.getByRole("button", { name: "impersonationStop" }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/dashboard");
    });
    expect(replace).not.toHaveBeenCalledWith("/login");
    expect(getAccessToken()).toBe("admin-token");
    expect(client.getQueryData(["me"])).toEqual(admin);
    expect(client.getQueryData(["notifications", "unread-count"])).toBeUndefined();
    expect(toastError).not.toHaveBeenCalled();
    // The admin is still signed in here: only the impersonation's drafts go.
    expect(readDraft(IMPERSONATED_OWNER, "journal", "class-1")).toBeNull();
    expect(readDraft(ADMIN_OWNER, "counseling", "new")).not.toBeNull();
  });

  it("signs in again from an expired role-testing session without keeping its token", async () => {
    get.mockRejectedValue(
      new ApiError({ status: 401, code: "AUTH_TOKEN_EXPIRED", message: "expired" }),
    );
    const user = userEvent.setup();
    const client = renderStrip({ roleStatusKnown: false });

    await user.click(await screen.findByRole("button", { name: "signIn" }));

    expect(replace).toHaveBeenCalledWith("/login");
    expect(getAccessToken()).toBeNull();
    expect(forgetAccessToken).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["notifications", "unread-count"])).toBeUndefined();
  });

  // The admin is not sent to the forced password change while impersonating
  // (lib/session/forced-password-change.ts), so the strip, which keeps its
  // Stop button, says the account still has to set its own password.
  it("notes a pending password change on the account and keeps the way back", () => {
    const account = teacher as { must_change_password: boolean };
    account.must_change_password = true;
    try {
      renderStrip();

      // The strip's detail is hidden below `sm` and is cut first by the
      // ellipsis, so the note also stands beside the Stop button, outside it.
      const note = screen.getByText("impersonationPendingPassword");
      expect(note.closest(".hidden")).toBeNull();
      expect(note.closest("p")).toBeNull();
      const badge = note.closest("[title]");
      expect(badge).toHaveAttribute("title", "pendingPassword");
      // On a phone the badge is its key icon alone, so the title keeps the
      // row's room for the account's name; its words return from `sm` and
      // stay readable to a screen reader at every width (audit
      // auth-users-R1: the full badge cut the title to "Operator Uji ...").
      expect(note).toHaveClass("sr-only", "sm:not-sr-only");
      expect(badge?.querySelector("svg.lucide-key-round")).toHaveAttribute("aria-hidden", "true");
      // The full sentence leads the detail, ahead of the long banner text.
      expect(screen.getByRole("status")).toHaveTextContent("pendingPassword · banner");
      expect(screen.getByRole("button", { name: "impersonationStop" })).toBeEnabled();
    } finally {
      account.must_change_password = false;
    }
  });

  // A phone shows the title alone and cuts its end first: it names the
  // operated account right at the start, and the admin's own name (they
  // know who they are) is left to the detail (audit auth-users-R1).
  it("titles the strip with the operated account, the admin's name in the detail", () => {
    renderStrip();

    const title = translated.filter(({ key }) => key === "impersonation");
    expect(title.length).toBeGreaterThan(0);
    for (const { values } of title) expect(values).toEqual({ name: "Teacher" });
    const banner = translated.find(({ key }) => key === "banner");
    expect(banner?.values).toEqual({ name: "Teacher", adminName: "Admin" });
    for (const messages of [id, en]) {
      const message = messages.app.shell.strip.impersonation;
      expect(message).not.toContain("{adminName}");
      expect(message.indexOf("{name}")).toBeLessThanOrEqual("Masuk sebagai ".length);
    }
  });

  it("says nothing about the password once the account has set its own", () => {
    renderStrip();

    expect(screen.getByRole("status")).not.toHaveTextContent("pendingPassword");
    expect(screen.queryByText("impersonationPendingPassword")).toBeNull();
  });
});

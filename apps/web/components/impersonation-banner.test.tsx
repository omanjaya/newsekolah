import { ApiError } from "@newsekolah/api-client";
import type * as UiModule from "@newsekolah/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, setAccessToken } from "../lib/api/access-token";
import { CLEAR_ACCESS_COOKIE_PATH } from "../lib/session/clear-server-access-cookie";
import type { Me } from "../lib/session/session-provider";

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
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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
  sessionStorage.clear();
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

  it("goes to the sign-in page with no token left once the server stopped the impersonation", async () => {
    post.mockResolvedValue(undefined);
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
});

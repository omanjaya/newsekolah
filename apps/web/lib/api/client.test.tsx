import type { CreateApiClientOptions } from "@newsekolah/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientProvider } from "./client";

const created = vi.hoisted(() => ({ options: undefined as CreateApiClientOptions | undefined }));

vi.mock("@newsekolah/api-client", () => ({
  createApiClient: (options: CreateApiClientOptions) => {
    created.options = options;
    return {};
  },
}));

function renderProvider(sessionCookieSeen: boolean) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiClientProvider locale="id" onUnauthorized={vi.fn()} sessionCookieSeen={sessionCookieSeen}>
        <span />
      </ApiClientProvider>
    </QueryClientProvider>,
  );
  const skip = created.options?.skipBootRefresh;
  if (!skip) throw new Error("the client was built without skipBootRefresh");
  return skip;
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("ApiClientProvider", () => {
  it("sends no session refresh from a public page the browser has no session for", () => {
    window.history.replaceState(null, "", "/verify/ZLYER5");
    const skipBootRefresh = renderProvider(false);

    expect(skipBootRefresh()).toBe(true);
    // A client-side navigation into the app restores the session there.
    window.history.replaceState(null, "", "/dashboard");
    expect(skipBootRefresh()).toBe(false);
  });

  it("restores a session on a public page when the browser holds a refresh cookie", () => {
    window.history.replaceState(null, "", "/opac");

    expect(renderProvider(true)()).toBe(false);
  });

  it("always asks on the sign-in page, which sends a signed-in tab onward", () => {
    window.history.replaceState(null, "", "/login");

    expect(renderProvider(false)()).toBe(false);
  });
});

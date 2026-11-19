import type { Metadata } from "next";
import { describe, expect, it, vi } from "vitest";

import * as changePassword from "../../app/(auth)/change-password/layout";
import * as forgotPassword from "../../app/(auth)/forgot-password/layout";
import * as login from "../../app/(auth)/login/layout";
import * as resetPassword from "../../app/(auth)/reset-password/layout";
import * as offline from "../../app/(public)/offline/layout";
import * as opac from "../../app/(public)/opac/page";
import "../../messages/features";

import { getMessages } from "./get-messages";
import { pageTitleMetadata } from "./page-metadata";

/** Looks the message up in the real Indonesian catalogue, failing on a missing key. */
function lookup(namespace: string, key: string): string {
  const value = `${namespace}.${key}`
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      getMessages("id"),
    );
  if (typeof value !== "string") throw new Error(`no message ${namespace}.${key}`);
  return value;
}

const getTranslations = vi.hoisted(() => vi.fn());
vi.mock("next-intl/server", () => ({ getTranslations }));
getTranslations.mockImplementation((namespace: string) =>
  Promise.resolve((key: string) => lookup(namespace, key)),
);

describe("pageTitleMetadata", () => {
  // The root layout's template turns this into "<page> · <school>".
  it("gives the page's own title from its message", async () => {
    await expect(pageTitleMetadata("auth.login", "title")).resolves.toEqual({ title: "Masuk" });
    expect(getTranslations).toHaveBeenCalledWith("auth.login");
  });
});

// Every sign-in and public page with a fixed name used to be titled only
// the school's name before its script ran.
describe("auth and public page metadata", () => {
  it.each<[string, { generateMetadata: () => Promise<Metadata> }, string]>([
    ["/login", login, "Masuk"],
    ["/forgot-password", forgotPassword, "Lupa kata sandi"],
    ["/reset-password", resetPassword, "Atur kata sandi baru"],
    ["/change-password", changePassword, "Ubah kata sandi"],
    ["/offline", offline, "Tidak ada koneksi"],
    ["/opac", opac, lookup("app.library.opac", "title")],
  ])("titles %s after the page", async (_path, route, title) => {
    await expect(route.generateMetadata()).resolves.toEqual({ title });
  });

  it("only adds a title, rendering the page as it is", () => {
    const child = <p>page</p>;
    expect(changePassword.default({ children: child })).toBe(child);
  });
});

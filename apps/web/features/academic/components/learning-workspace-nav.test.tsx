import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { LearningWorkspaceNav } from "./learning-workspace-nav";

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  profile_kind: "teacher",
  pathname: "/school/learning",
  search: "",
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useSession: () => ({ me: state }) }));
afterEach(cleanup);
beforeEach(() => {
  state.permissions = [];
  state.profile_kind = "teacher";
  state.pathname = "/school/learning";
  state.search = "";
});

it("offers no tab without master data permission", () => {
  state.permissions = ["view_academic_data"];
  render(<LearningWorkspaceNav />);
  expect(screen.queryAllByRole("link")).toHaveLength(0);
});

it("lists the four workspace tabs for master data managers", () => {
  state.permissions = ["manage_master_data"];
  render(<LearningWorkspaceNav />);
  expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
    "/school/learning",
    "/school/learning?tab=periods",
    "/school/assignments",
    "/school/assignments?tab=duties",
  ]);
  expect(screen.getByRole("link", { name: "subjectsTab" })).toHaveAttribute("aria-current", "page");
});

it("keeps existing tab params mapped onto their workspace tab", () => {
  state.permissions = ["manage_master_data"];
  state.search = "tab=offerings";
  render(<LearningWorkspaceNav />);
  expect(screen.getByRole("link", { name: "subjectsTab" })).toHaveAttribute("aria-current", "page");
  cleanup();
  state.pathname = "/school/assignments";
  state.search = "tab=types";
  render(<LearningWorkspaceNav />);
  expect(screen.getByRole("link", { name: "dutiesTab" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "teachingTab" })).not.toHaveAttribute("aria-current");
});

it("falls back to the first tab of the page for an unknown tab param", () => {
  state.permissions = ["manage_master_data"];
  state.pathname = "/school/assignments";
  state.search = "tab=nope";
  render(<LearningWorkspaceNav />);
  expect(screen.getByRole("link", { name: "teachingTab" })).toHaveAttribute("aria-current", "page");
});

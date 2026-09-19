import { act, renderHook } from "@testing-library/react";
import { Home, Users } from "lucide-react";
import { beforeEach, describe, expect, it } from "vitest";

import type { NavItem } from "../navigation";

import { useNavigationPreferences } from "./use-navigation-preferences";

const items: NavItem[] = [
  { key: "home", labelKey: "Home", href: "/dashboard", icon: Home },
  { key: "users", labelKey: "Users", href: "/school/users", icon: Users },
];

describe("navigation preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  it("remembers registry keys and never stores visited detail paths", () => {
    const { result, unmount } = renderHook(() =>
      useNavigationPreferences("school:user", items, "/school/users/private-id"),
    );
    act(() => {
      result.current.toggleFavorite("users");
    });
    expect(result.current.favorites.map((item) => item.key)).toEqual(["users"]);
    unmount();
    const restored = renderHook(() => useNavigationPreferences("school:user", items, "/dashboard"));
    expect(restored.result.current.favorites.map((item) => item.key)).toEqual(["users"]);
    expect(window.localStorage.getItem("newsekolah:navigation:school:user")).not.toContain(
      "private-id",
    );
  });
  it("isolates accounts and hides destinations after permission revocation", () => {
    const { result, rerender } = renderHook(
      ({ scope, allowed }) => useNavigationPreferences(scope, allowed, "/dashboard"),
      {
        initialProps: { scope: "school:user-a", allowed: items },
      },
    );
    act(() => {
      result.current.toggleFavorite("users");
    });
    rerender({ scope: "school:user-b", allowed: items });
    expect(result.current.favorites).toEqual([]);
    rerender({ scope: "school:user-a", allowed: items.slice(0, 1) });
    expect(result.current.favorites).toEqual([]);
    expect(result.current.recent.every((item) => item.key !== "users")).toBe(true);
  });
});

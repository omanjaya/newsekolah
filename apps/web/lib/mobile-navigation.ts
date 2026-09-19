import type { NavItem, NavProfileKind } from "./navigation";

/** Choose two daily destinations from the already authorized registry. */
export function mobileNavigation(items: NavItem[], profile?: NavProfileKind): NavItem[] {
  const priorities =
    profile === "parent"
      ? ["children", "leave-requests"]
      : profile === "teacher"
        ? ["attendance", "schedule"]
        : profile === "student"
          ? ["schedule", "exit-permits"]
          : ["duty", "library-desk", "school-classes", "attendance"];
  const daily = priorities
    .flatMap((key) => {
      const item = items.find((entry) => entry.key === key);
      return item ? [item] : [];
    })
    .slice(0, 2);
  return [
    items.find((item) => item.key === "dashboard"),
    ...daily,
    items.find((item) => item.key === "profile"),
  ].filter((item): item is NavItem => Boolean(item));
}

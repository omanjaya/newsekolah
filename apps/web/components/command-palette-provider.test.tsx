import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPaletteProvider, useCommandPalette } from "./command-palette-provider";

const session = vi.hoisted(() => ({ permissions: [] as string[], profileKind: "student" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../lib/session/session-provider", () => ({
  useSession: () => ({
    me: {
      id: "u1",
      profile_kind: session.profileKind,
      permissions: session.permissions,
      roles: [],
      duties: [],
      disabled_modules: [],
      tenant: { tenant_id: "t1" },
    },
  }),
}));
vi.mock("../lib/use-quick-actions", () => ({ useQuickActions: () => [] }));
vi.mock("../features/students/lib/use-palette-student-group", () => ({
  usePaletteStudentGroup: () => ({
    group: undefined,
    onSearchChange: vi.fn(),
    reset: vi.fn(),
  }),
}));

function Placeholder() {
  return <p>{useCommandPalette().placeholder}</p>;
}

function renderPlaceholder() {
  render(
    <CommandPaletteProvider>
      <Placeholder />
    </CommandPaletteProvider>,
  );
}

beforeEach(() => {
  session.permissions = [];
  session.profileKind = "student";
});

describe("CommandPaletteProvider placeholder", () => {
  // A student cannot open a student's profile, so the search finds no
  // students for them and must not say it does.
  it("promises only pages and actions to a reader who cannot search students", () => {
    renderPlaceholder();
    expect(screen.getByText("placeholderPages")).toBeInTheDocument();
  });

  it("mentions students to a reader who may open a student's profile", () => {
    session.profileKind = "staff";
    session.permissions = ["view_discipline"];
    renderPlaceholder();
    expect(screen.getByText("placeholder")).toBeInTheDocument();
  });
});

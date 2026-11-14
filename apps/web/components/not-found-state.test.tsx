import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotFoundState } from "./not-found-state";

const session = vi.fn<() => { status: string }>();

vi.mock("../lib/session/session-provider", () => ({ useSession: () => session() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn() }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

describe("NotFoundState", () => {
  it("takes someone signed in back home, with the 404 code", () => {
    session.mockReturnValue({ status: "authenticated" });
    render(<NotFoundState />);
    expect(screen.getByRole("heading", { level: 1, name: "title" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backHome" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText(/404/)).toBeInTheDocument();
  });

  it("sends a visitor to the sign-in page", () => {
    session.mockReturnValue({ status: "anonymous" });
    render(<NotFoundState />);
    expect(screen.getByRole("link", { name: "signIn" })).toHaveAttribute("href", "/login");
  });
});

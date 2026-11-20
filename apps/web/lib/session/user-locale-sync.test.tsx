import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearUserLocaleCookie, readUserLocaleCookie } from "../i18n/user-locale-cookie";

import { UserLocaleSync } from "./user-locale-sync";

const refresh = vi.fn();
const session = vi.fn<() => unknown>();
const uiLocale = vi.fn<() => string>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next-intl", () => ({ useLocale: () => uiLocale() }));
vi.mock("./session-provider", () => ({ useSession: () => session() }));

afterEach(() => {
  cleanup();
  clearUserLocaleCookie();
  refresh.mockReset();
});

describe("UserLocaleSync", () => {
  it("stores the user's preference and re-renders the page in it", () => {
    session.mockReturnValue({ me: { locale: "en" } });
    uiLocale.mockReturnValue("id");
    const { rerender } = render(<UserLocaleSync />);

    expect(readUserLocaleCookie()).toBe("en");
    expect(refresh).toHaveBeenCalledTimes(1);

    // The same preference never triggers a second re-render.
    rerender(<UserLocaleSync />);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("only stores the preference when the page is already in it", () => {
    session.mockReturnValue({ me: { locale: "id" } });
    uiLocale.mockReturnValue("id");
    render(<UserLocaleSync />);

    expect(readUserLocaleCookie()).toBe("id");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing while signed out", () => {
    session.mockReturnValue({ me: undefined });
    uiLocale.mockReturnValue("id");
    render(<UserLocaleSync />);

    expect(readUserLocaleCookie()).toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
  });
});

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getMessages } from "../lib/i18n/get-messages";
import { setDocumentSchoolName } from "../lib/page-title";

import { ForbiddenPage } from "./forbidden-page";
import { ModuleUnavailablePage } from "./module-unavailable-page";

const route = vi.hoisted(() => ({ pathname: "/journal" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  usePathname: () => route.pathname,
}));

const session = vi.hoisted(() => ({ roles: [] as { slug: string }[] }));
vi.mock("../lib/session/session-provider", () => ({
  useSession: () => ({ me: { roles: session.roles } }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function renderInId(element: React.ReactElement) {
  setDocumentSchoolName("SMA Contoh");
  return render(
    <NextIntlClientProvider locale="id" messages={getMessages("id") as never}>
      {element}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  document.title = "";
  route.pathname = "/journal";
  session.roles = [];
});

// The page these stand in for never mounts, so without them the tab would
// read only the school's name.
describe("state pages inside the shell", () => {
  it("names the tab after the forbidden state", () => {
    const view = renderInId(<ForbiddenPage />);
    const title = screen.getByRole("heading", { level: 1 }).textContent;
    expect(title).not.toBe("");
    expect(document.title).toBe(`${title} · SMA Contoh`);
    view.unmount();
    expect(document.title).toBe("SMA Contoh");
  });

  it("names the tab after the module-unavailable state", () => {
    renderInId(<ModuleUnavailablePage />);
    const title = screen.getByRole("heading", { level: 1 }).textContent;
    expect(document.title).toBe(`${title} · SMA Contoh`);
  });
});

// The copy says whom to ask only when there is someone to ask.
describe("forbidden page copy", () => {
  it("sends a reader to the school admin", () => {
    renderInId(<ForbiddenPage />);
    expect(screen.getByText(/Hubungi admin sekolah/)).toBeInTheDocument();
  });

  it("does not send the school admin to themselves", () => {
    session.roles = [{ slug: "admin" }];
    renderInId(<ForbiddenPage />);
    expect(screen.getByText("Akun Anda belum punya izin untuk halaman ini.")).toBeInTheDocument();
    expect(screen.queryByText(/admin sekolah/)).not.toBeInTheDocument();
  });

  it("names a platform operator's page as theirs, from the route's permission", () => {
    session.roles = [{ slug: "admin" }];
    route.pathname = "/platform/operator-alerts";
    renderInId(<ForbiddenPage />);
    expect(screen.getByText("Halaman ini khusus operator platform.")).toBeInTheDocument();
  });

  it("fills the viewport outside the shell", () => {
    const { container } = renderInId(<ForbiddenPage fullScreen />);
    expect(container.querySelector("[data-page-shell]")).toBeNull();
    expect(container.firstElementChild).toHaveClass("min-h-dvh");
  });
});

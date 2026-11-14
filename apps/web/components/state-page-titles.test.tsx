import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getMessages } from "../lib/i18n/get-messages";
import { setDocumentSchoolName } from "../lib/page-title";

import { ForbiddenPage } from "./forbidden-page";
import { ModuleUnavailablePage } from "./module-unavailable-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
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

import { queryKeys } from "@newsekolah/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ModuleUnavailablePage } from "./module-unavailable-page";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function renderPage(client: QueryClient): void {
  render(
    <QueryClientProvider client={client}>
      <ModuleUnavailablePage />
    </QueryClientProvider>,
  );
}

describe("ModuleUnavailablePage", () => {
  it("re-reads the session on check again, so a module switched back on reappears", async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    renderPage(client);

    await userEvent.click(screen.getByRole("button", { name: "checkAgain" }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.me() });
  });

  it("keeps the way back home", () => {
    renderPage(new QueryClient());
    expect(screen.getByRole("link", { name: "backHome" })).toHaveAttribute("href", "/dashboard");
  });
});

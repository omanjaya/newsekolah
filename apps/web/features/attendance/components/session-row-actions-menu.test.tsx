import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const disabled = vi.hoisted(() => new Set<string>());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.name ? `${key}:${values.name}` : key,
}));
vi.mock("../../../lib/modules/use-module-enabled", () => ({
  useModuleEnabled: (module: string) => !disabled.has(module),
}));

import { SessionRowActionsMenu } from "./session-row-actions-menu";

function renderMenu(): HTMLElement {
  render(
    <SessionRowActionsMenu
      studentName="Ayu"
      noteActive={false}
      noteToggleDisabled={false}
      onToggleNote={vi.fn()}
      violationIds={["v-1"]}
      violationTypes={[]}
      violationTypesLoading={false}
      disabled={false}
      onToggleViolation={vi.fn()}
    />,
  );
  return screen.getByRole("button", { name: "moreActions:Ayu" });
}

describe("SessionRowActionsMenu with discipline switched off", () => {
  beforeEach(() => {
    disabled.clear();
  });

  it("highlights a row that has violations while discipline is on", () => {
    expect(renderMenu()).toHaveClass("border-accent");
  });

  it("does not highlight violations kept from before discipline was switched off", () => {
    disabled.add("discipline");
    expect(renderMenu()).not.toHaveClass("border-accent");
  });
});

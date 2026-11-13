import { describe, expect, it } from "vitest";

import { DOCUMENT_TEMPLATE_KINDS, TEMPLATE_KIND_MODULE, availableTemplateKinds } from "./api";

const off =
  (...modules: string[]) =>
  (module: string) =>
    !modules.includes(module);

describe("availableTemplateKinds", () => {
  it("offers every kind while every module is on", () => {
    expect(availableTemplateKinds(off())).toEqual(DOCUMENT_TEMPLATE_KINDS);
  });

  it("leaves out the kinds of a switched-off module only", () => {
    const kinds = availableTemplateKinds(off("permits"));
    expect(kinds).not.toContain("leave_letter");
    expect(kinds).toContain("warning_letter");
    expect(kinds).toContain("visitor_badge");
  });

  it("keeps kinds owned by always-on modules whatever is off", () => {
    const kinds = availableTemplateKinds(
      off("permits", "discipline", "visitors", "library", "reports"),
    );
    expect(kinds).toEqual(["class_journal"]);
  });

  it("names an owner for every kind the API's owner mapping knows", () => {
    expect(TEMPLATE_KIND_MODULE).toEqual({
      leave_letter: "permits",
      warning_letter: "discipline",
      visitor_badge: "visitors",
      class_journal: undefined,
      member_card: "library",
      item_label: "library",
      clearance_letter: "library",
      report: "reports",
    });
  });
});

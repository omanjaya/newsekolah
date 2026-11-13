import { describe, expect, it } from "vitest";

import { matchMemberByCode } from "./member-code-match";

const siti = { user_id: "u1", member_no: "LIB-0012", nis: "2024001", username: "siti" };
const budi = { user_id: "u2", member_no: "LIB-0120", nis: "2024012", username: "budi" };

describe("matchMemberByCode", () => {
  it("accepts an exact member number regardless of case and spaces", () => {
    expect(matchMemberByCode([budi, siti], " lib-0012 ")).toEqual({
      status: "found",
      member: siti,
    });
  });

  it("does not accept a fuzzy substring hit", () => {
    expect(matchMemberByCode([siti, budi], "LIB-01")).toEqual({ status: "none" });
    expect(matchMemberByCode([siti], "Sit")).toEqual({ status: "none" });
  });

  it("reports ambiguity when two people share the exact code", () => {
    const clash = { ...budi, nis: "2024001" };
    expect(matchMemberByCode([siti, clash], "2024001")).toEqual({ status: "ambiguous" });
  });

  it("treats an empty code as no match", () => {
    expect(matchMemberByCode([siti], "  ")).toEqual({ status: "none" });
  });
});

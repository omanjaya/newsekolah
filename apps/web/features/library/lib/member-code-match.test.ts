import { describe, expect, it } from "vitest";

import { PRINTED_CARD_CODE_FIELDS, matchMemberByCode } from "./member-code-match";

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

  it("matches only the printed member number when the caller narrows the fields", () => {
    expect(matchMemberByCode([siti], "LIB-0012", PRINTED_CARD_CODE_FIELDS)).toEqual({
      status: "found",
      member: siti,
    });
    expect(matchMemberByCode([siti], "2024001", PRINTED_CARD_CODE_FIELDS)).toEqual({
      status: "none",
    });
    expect(matchMemberByCode([siti], "siti", PRINTED_CARD_CODE_FIELDS)).toEqual({
      status: "none",
    });
  });

  it("treats an empty code as no match", () => {
    expect(matchMemberByCode([siti], "  ")).toEqual({ status: "none" });
  });
});

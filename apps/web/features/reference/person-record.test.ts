import { ApiError } from "@newsekolah/api-client";
import { describe, expect, it } from "vitest";

import type { DirectoryUser } from "./api";
import type { NamesResult } from "./directory-names";
import { personRecordStatus } from "./person-record";

const person = { id: "s1", name: "Ayu", username: "ayu" } as DirectoryUser;

function lookup(overrides: Partial<NamesResult>): NamesResult {
  return {
    names: new Map(),
    isLoading: false,
    isError: false,
    isSuccess: false,
    error: undefined,
    refetch: () => undefined,
    ...overrides,
  };
}

describe("personRecordStatus", () => {
  it("is pending while the lookup runs", () => {
    expect(personRecordStatus(lookup({ isLoading: true }), "s1")).toBe("pending");
  });

  it("is found once the directory knows the id", () => {
    const names = new Map([["s1", person]]);
    expect(personRecordStatus(lookup({ names, isSuccess: true }), "s1")).toBe("found");
  });

  it("is found for a person of the kind the route expects", () => {
    const names = new Map([["s1", { ...person, profile_kind: "student" as const }]]);
    expect(personRecordStatus(lookup({ names, isSuccess: true }), "s1", "student")).toBe("found");
  });

  it("is missing for a person of another kind than the route expects", () => {
    const staff = new Map([["s1", { ...person, profile_kind: "staff" as const }]]);
    expect(personRecordStatus(lookup({ names: staff, isSuccess: true }), "s1", "student")).toBe(
      "missing",
    );
    // A user with no profile at all (a platform administrator) is no student either.
    const bare = new Map([["s1", person]]);
    expect(personRecordStatus(lookup({ names: bare, isSuccess: true }), "s1", "student")).toBe(
      "missing",
    );
  });

  it("is missing when the directory answers without the id", () => {
    expect(personRecordStatus(lookup({ isSuccess: true }), "s1")).toBe("missing");
  });

  it("is missing when the id is not an id at all", () => {
    const error = new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "invalid",
      details: [{ field: "ids", code: "INVALID_FORMAT" }],
    });
    expect(personRecordStatus(lookup({ isError: true, error }), "abc")).toBe("missing");
  });

  it("is failed when the lookup itself failed", () => {
    const error = new ApiError({ status: 503, code: "UNAVAILABLE", message: "down" });
    expect(personRecordStatus(lookup({ isError: true, error }), "s1")).toBe("failed");
  });
});

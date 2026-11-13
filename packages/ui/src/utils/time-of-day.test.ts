import { describe, expect, it } from "vitest";

import { formatTime, parseTime, parseTypedTime, timeSteps } from "./time-of-day.js";

describe("time-of-day", () => {
  it("accepts only 24-hour HH:mm as a stored value", () => {
    expect(parseTime("07:30")).toBe(7 * 60 + 30);
    expect(parseTime("7:30")).toBeNull();
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("")).toBeNull();
  });

  it("reads typed times in the forms people use", () => {
    expect(parseTypedTime("8")).toBe(8 * 60);
    expect(parseTypedTime("830")).toBe(8 * 60 + 30);
    expect(parseTypedTime("0830")).toBe(8 * 60 + 30);
    expect(parseTypedTime("8.30")).toBe(8 * 60 + 30);
    expect(parseTypedTime("14:05")).toBe(14 * 60 + 5);
    expect(parseTypedTime("24:00")).toBeNull();
    expect(parseTypedTime("12:60")).toBeNull();
    expect(parseTypedTime("pagi")).toBeNull();
  });

  it("shows the locale's separator and lists steps within bounds", () => {
    expect(formatTime(8 * 60 + 30, "id-ID")).toBe("08.30");
    expect(formatTime(8 * 60 + 30, "en-US")).toBe("08:30");
    expect(timeSteps(30, 7 * 60, 9 * 60)).toEqual([420, 450, 480, 510, 540]);
  });
});

import { parseRealtimeMessage, reconnectDelay, stringField } from "@/lib/realtime/envelope";

describe("parseRealtimeMessage", () => {
  it("parses an Envelope-shaped frame", () => {
    const message = parseRealtimeMessage(
      JSON.stringify({
        type: "hello",
        topic: "user:t1:u1",
        at: "2026-09-25T00:00:00Z",
        payload: { connection_id: "c1" },
      }),
    );
    expect(message?.type).toBe("hello");
    expect(message?.payload).toEqual({ connection_id: "c1" });
  });

  it("parses a flat, non-Envelope frame (classroom_entry_scanned's pre-migration shape)", () => {
    const message = parseRealtimeMessage(
      JSON.stringify({ type: "classroom_entry_scanned", student_name: "Sari", class_name: "7A" }),
    );
    expect(message?.type).toBe("classroom_entry_scanned");
    expect(message).not.toBeNull();
    if (!message) throw new Error("expected a parsed message");
    expect(stringField(message, "student_name")).toBe("Sari");
  });

  it("returns null for invalid JSON", () => {
    expect(parseRealtimeMessage("not json")).toBeNull();
  });

  it("returns null for a JSON value that is not an object", () => {
    expect(parseRealtimeMessage("42")).toBeNull();
    expect(parseRealtimeMessage('"a string"')).toBeNull();
    expect(parseRealtimeMessage("null")).toBeNull();
  });

  it("returns null when `type` is missing or not a string", () => {
    expect(parseRealtimeMessage(JSON.stringify({ payload: {} }))).toBeNull();
    expect(parseRealtimeMessage(JSON.stringify({ type: 1 }))).toBeNull();
  });
});

describe("stringField", () => {
  it("defaults to an empty string for a missing or non-string field", () => {
    const message = parseRealtimeMessage(JSON.stringify({ type: "x", count: 3 }));
    if (!message) throw new Error("expected a parsed message");
    expect(stringField(message, "missing")).toBe("");
    expect(stringField(message, "count")).toBe("");
  });
});

describe("reconnectDelay", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("doubles the ceiling per attempt, capped at 30s, full jitter over [ceiling/2, ceiling]", () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    expect(reconnectDelay(0)).toBe(500); // ceiling 1000
    expect(reconnectDelay(1)).toBe(1000); // ceiling 2000
    expect(reconnectDelay(4)).toBe(8000); // ceiling 16000
    expect(reconnectDelay(10)).toBe(15000); // ceiling capped at 30000

    jest.spyOn(Math, "random").mockReturnValue(1);
    expect(reconnectDelay(0)).toBe(1000);
    expect(reconnectDelay(10)).toBe(30000);
  });

  it("never returns a negative or unbounded delay for a very large attempt count", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.3);
    const delay = reconnectDelay(1000);
    expect(delay).toBeGreaterThanOrEqual(15000);
    expect(delay).toBeLessThanOrEqual(30000);
  });
});

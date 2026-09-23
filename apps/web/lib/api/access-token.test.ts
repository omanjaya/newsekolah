import { afterEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, setAccessToken, subscribeAccessToken } from "./access-token";

describe("access token store", () => {
  afterEach(() => {
    setAccessToken(null);
  });

  it("notifies subscribers of each new token until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAccessToken(listener);

    setAccessToken("first");
    setAccessToken("first");
    setAccessToken("second");
    unsubscribe();
    setAccessToken("third");

    expect(listener.mock.calls).toEqual([["first"], ["second"]]);
    expect(getAccessToken()).toBe("third");
  });
});

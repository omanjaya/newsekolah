import { isOnline } from "@/lib/offline/network";
import { getBaseUrl } from "@/lib/tenant/tenant-store";

jest.mock("@/lib/tenant/tenant-store", () => ({
  getBaseUrl: jest.fn(() => "https://api.example.test"),
}));

const getBaseUrlMock = jest.mocked(getBaseUrl);

describe("isOnline", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
  });

  it("is true when the server answers, even with an error status", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(isOnline()).resolves.toBe(true);
  });

  it("is false when the request never reaches the server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(isOnline()).resolves.toBe(false);
  });

  it("is false when there is no configured server", async () => {
    getBaseUrlMock.mockReturnValueOnce("");
    await expect(isOnline()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

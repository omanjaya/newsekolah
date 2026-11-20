import { describe, expect, it } from "vitest";

import { storageOriginFromEnv } from "./storage-origin";

describe("storageOriginFromEnv", () => {
  it("prefers the web app's own setting", () => {
    expect(
      storageOriginFromEnv({
        NEXT_PUBLIC_S3_PUBLIC_ORIGIN: "https://files.school.example/bucket",
        S3_PUBLIC_ENDPOINT: "https://other.example",
        S3_ENDPOINT: "minio:9000",
      }),
    ).toBe("https://files.school.example");
  });

  it("falls back to the API's public endpoint", () => {
    expect(storageOriginFromEnv({ S3_PUBLIC_ENDPOINT: "http://localhost:9000" })).toBe(
      "http://localhost:9000",
    );
  });

  it("uses the bare endpoint the API signs against, with its TLS setting", () => {
    expect(storageOriginFromEnv({ S3_ENDPOINT: "127.0.0.1:9000", S3_USE_SSL: "false" })).toBe(
      "http://127.0.0.1:9000",
    );
    expect(storageOriginFromEnv({ S3_ENDPOINT: "s3.example.com", S3_USE_SSL: "true" })).toBe(
      "https://s3.example.com",
    );
    expect(storageOriginFromEnv({ S3_ENDPOINT: "http://localhost:9000" })).toBe(
      "http://localhost:9000",
    );
  });

  it("is empty when nothing usable is set", () => {
    expect(storageOriginFromEnv({})).toBe("");
    expect(storageOriginFromEnv({ NEXT_PUBLIC_S3_PUBLIC_ORIGIN: "  " })).toBe("");
    expect(storageOriginFromEnv({ S3_ENDPOINT: "ftp://files.example" })).toBe("");
  });
});

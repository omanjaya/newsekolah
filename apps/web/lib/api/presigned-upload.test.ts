import { ApiError } from "@newsekolah/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadToPresignedUrl } from "./presigned-upload";

/** An XHR whose send() immediately fails the way a CSP-blocked request does. */
class BlockedXhr {
  upload = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 0;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send() {
    this.onerror?.();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadToPresignedUrl", () => {
  it("reports an unreachable storage origin with its own code, not as the user's network", async () => {
    vi.stubGlobal("XMLHttpRequest", BlockedXhr);
    const file = new File(["x"], "logo.png", { type: "image/png" });

    const error: unknown = await uploadToPresignedUrl(
      "http://127.0.0.1:9000/b/k",
      file,
      vi.fn(),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("UPLOAD_STORAGE_UNREACHABLE");
  });
});

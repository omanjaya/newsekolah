import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { AvatarUpload } from "./avatar-upload";

const mocks = vi.hoisted(() => ({
  requestUpload: vi.fn(),
  confirmUpload: vi.fn(),
  uploadToPresignedUrl: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { name: "Sari", avatar_url: undefined } }),
}));
vi.mock("../../../lib/api/presigned-upload", () => ({
  uploadToPresignedUrl: mocks.uploadToPresignedUrl,
}));
vi.mock("../api", () => ({
  useRequestAvatarUploadMutation: () => ({ mutateAsync: mocks.requestUpload }),
  useConfirmAvatarUploadMutation: () => ({ mutateAsync: mocks.confirmUpload }),
}));

function largeJpegFile(sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], "selfie.jpg", { type: "image/jpeg" });
}

// Mocks the canvas pipeline compressImage drives (see
// lib/media/compress-image.test.ts for the helper's own unit tests) so
// this test exercises the real compressImage code path end to end and
// can assert on exactly what avatar-upload.tsx hands to the upload call.
function mockCanvasCompression(outputBytes: number) {
  globalThis.createImageBitmap = vi.fn().mockResolvedValue({
    width: 4000,
    height: 3000,
    close: vi.fn(),
  });

  class FakeOffscreenCanvas {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      return { drawImage: vi.fn() };
    }
    convertToBlob() {
      return Promise.resolve(new Blob([new Uint8Array(outputBytes)], { type: "image/jpeg" }));
    }
  }
  globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
}

afterEach(() => {
  vi.restoreAllMocks();
});

it("uploads the compressed blob, not the original file the user picked", async () => {
  const originalBytes = 3 * 1024 * 1024; // a typical 3 MB phone photo
  const compressedBytes = 250 * 1024;
  mockCanvasCompression(compressedBytes);
  mocks.requestUpload.mockResolvedValue({
    upload_url: "https://storage.example/put",
    object_key: "avatars/tenant-1/user-1.jpg",
  });
  mocks.confirmUpload.mockResolvedValue(undefined);
  mocks.uploadToPresignedUrl.mockResolvedValue(undefined);

  const user = userEvent.setup();
  render(<AvatarUpload />);

  const input = screen.getByLabelText("change", { selector: "input" });
  await user.upload(input, largeJpegFile(originalBytes));

  await waitFor(() => {
    expect(mocks.uploadToPresignedUrl).toHaveBeenCalled();
  });

  const [, uploadedFile] = mocks.uploadToPresignedUrl.mock.calls[0] as [string, File, unknown];
  expect(uploadedFile.size).toBe(compressedBytes);
  expect(uploadedFile.size).toBeLessThan(originalBytes);
  expect(uploadedFile.type).toBe("image/jpeg");
  expect(mocks.confirmUpload).toHaveBeenCalledWith("avatars/tenant-1/user-1.jpg");
});

it("skips the compression pipeline for a photo already under the threshold, uploading it unchanged", async () => {
  const createBitmap = vi.fn();
  globalThis.createImageBitmap = createBitmap;
  mocks.requestUpload.mockResolvedValue({
    upload_url: "https://storage.example/put",
    object_key: "avatars/tenant-1/user-1.jpg",
  });
  mocks.confirmUpload.mockResolvedValue(undefined);
  mocks.uploadToPresignedUrl.mockResolvedValue(undefined);

  const user = userEvent.setup();
  render(<AvatarUpload />);

  const small = largeJpegFile(50 * 1024);
  await user.upload(screen.getByLabelText("change", { selector: "input" }), small);

  await waitFor(() => {
    expect(mocks.uploadToPresignedUrl).toHaveBeenCalled();
  });

  const [, uploadedFile] = mocks.uploadToPresignedUrl.mock.calls[0] as [string, File, unknown];
  expect(uploadedFile).toBe(small);
  expect(createBitmap).not.toHaveBeenCalled();
});

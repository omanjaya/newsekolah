import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compressImage,
  computeTargetDimensions,
  DEFAULT_SKIP_BELOW_BYTES,
  formatFileSize,
  isRasterImageFile,
  shouldSkipCompression,
} from "./compress-image";

function makeFile(sizeBytes: number, type: string, name = "photo.jpg"): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("computeTargetDimensions", () => {
  it("scales down a landscape image so the width (long edge) hits the cap", () => {
    expect(computeTargetDimensions(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it("scales down a portrait image so the height (long edge) hits the cap", () => {
    expect(computeTargetDimensions(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("leaves an image already within bounds untouched", () => {
    expect(computeTargetDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("leaves an image exactly at the cap untouched", () => {
    expect(computeTargetDimensions(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it("never produces a zero-sized dimension for a very thin image", () => {
    const result = computeTargetDimensions(10000, 1, 1600);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  it("returns the input as-is when the long edge is zero", () => {
    expect(computeTargetDimensions(0, 0, 1600)).toEqual({ width: 0, height: 0 });
  });
});

describe("isRasterImageFile", () => {
  it("accepts common raster types", () => {
    expect(isRasterImageFile(makeFile(1000, "image/jpeg"))).toBe(true);
    expect(isRasterImageFile(makeFile(1000, "image/png"))).toBe(true);
    expect(isRasterImageFile(makeFile(1000, "image/webp"))).toBe(true);
  });

  it("rejects SVG and ICO -- vector/container formats a canvas cannot re-encode", () => {
    expect(isRasterImageFile(makeFile(1000, "image/svg+xml"))).toBe(false);
    expect(isRasterImageFile(makeFile(1000, "image/x-icon"))).toBe(false);
    expect(isRasterImageFile(makeFile(1000, "image/vnd.microsoft.icon"))).toBe(false);
  });

  it("rejects non-image files such as PDFs", () => {
    expect(isRasterImageFile(makeFile(1000, "application/pdf", "note.pdf"))).toBe(false);
  });
});

describe("shouldSkipCompression", () => {
  it("skips files below the default threshold", () => {
    const file = makeFile(DEFAULT_SKIP_BELOW_BYTES - 1, "image/jpeg");
    expect(shouldSkipCompression(file)).toBe(true);
  });

  it("does not skip a large raster image", () => {
    const file = makeFile(DEFAULT_SKIP_BELOW_BYTES + 1, "image/jpeg");
    expect(shouldSkipCompression(file)).toBe(false);
  });

  it("skips a large file that is not a raster image regardless of size", () => {
    const file = makeFile(5 * 1024 * 1024, "application/pdf", "evidence.pdf");
    expect(shouldSkipCompression(file)).toBe(true);
  });

  it("honors a caller-supplied threshold", () => {
    const file = makeFile(1000, "image/jpeg");
    expect(shouldSkipCompression(file, 500)).toBe(false);
    expect(shouldSkipCompression(file, 2000)).toBe(true);
  });
});

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(350 * 1024)).toBe("350 KB");
  });

  it("formats megabytes with one decimal", () => {
    expect(formatFileSize(2.3 * 1024 * 1024)).toBe("2.3 MB");
  });
});

describe("compressImage", () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;

  afterEach(() => {
    globalThis.createImageBitmap = originalCreateImageBitmap;
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
    vi.restoreAllMocks();
  });

  function mockCanvasPipeline(opts: {
    bitmapWidth: number;
    bitmapHeight: number;
    outputBytes: number;
    outputType: string;
  }) {
    const close = vi.fn();
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({
      width: opts.bitmapWidth,
      height: opts.bitmapHeight,
      close,
    });

    class FakeOffscreenCanvas {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return { drawImage: vi.fn() };
      }
      convertToBlob() {
        return Promise.resolve(
          new Blob([new Uint8Array(opts.outputBytes)], { type: opts.outputType }),
        );
      }
    }
    globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
    return { close };
  }

  it("skips files below the size threshold without touching the canvas pipeline", async () => {
    const createBitmap = vi.fn();
    globalThis.createImageBitmap = createBitmap;
    const file = makeFile(1000, "image/jpeg");

    const result = await compressImage(file, { maxLongEdge: 1600 });

    expect(result.wasCompressed).toBe(false);
    expect(result.file).toBe(file);
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it("passes a large PDF through untouched", async () => {
    const file = makeFile(5 * 1024 * 1024, "application/pdf", "evidence.pdf");
    const result = await compressImage(file, { maxLongEdge: 1600 });
    expect(result.wasCompressed).toBe(false);
    expect(result.file).toBe(file);
  });

  it("passes an SVG branding logo through untouched even when large", async () => {
    const file = makeFile(1024 * 1024, "image/svg+xml", "logo.svg");
    const result = await compressImage(file, { maxLongEdge: 1024 });
    expect(result.wasCompressed).toBe(false);
    expect(result.file).toBe(file);
  });

  it("downsizes and re-encodes a large photo, closing the decoded bitmap", async () => {
    const originalBytes = 5 * 1024 * 1024;
    const { close } = mockCanvasPipeline({
      bitmapWidth: 4000,
      bitmapHeight: 3000,
      outputBytes: 900 * 1024,
      outputType: "image/jpeg",
    });
    const file = makeFile(originalBytes, "image/jpeg", "evidence.jpg");

    const result = await compressImage(file, { maxLongEdge: 1600, quality: 0.8 });

    expect(result.wasCompressed).toBe(true);
    expect(result.originalSize).toBe(originalBytes);
    expect(result.compressedSize).toBe(900 * 1024);
    expect(result.file.type).toBe("image/jpeg");
    expect(result.file.name).toBe("evidence.jpg");
    expect(close).toHaveBeenCalled();
  });

  it("falls back to the original file when the canvas re-encode is not actually smaller", async () => {
    const originalBytes = 500 * 1024;
    mockCanvasPipeline({
      bitmapWidth: 1000,
      bitmapHeight: 800,
      outputBytes: originalBytes + 1,
      outputType: "image/jpeg",
    });
    const file = makeFile(originalBytes, "image/jpeg", "photo.jpg");

    const result = await compressImage(file, { maxLongEdge: 1600 });

    expect(result.wasCompressed).toBe(false);
    expect(result.file).toBe(file);
  });

  it("falls back to the original file when the environment has no createImageBitmap support", async () => {
    globalThis.createImageBitmap = undefined as unknown as typeof createImageBitmap;
    const file = makeFile(500 * 1024, "image/jpeg");

    const result = await compressImage(file, { maxLongEdge: 1600 });

    expect(result.wasCompressed).toBe(false);
    expect(result.file).toBe(file);
  });

  it("falls back to the original file when bitmap decoding throws", async () => {
    globalThis.createImageBitmap = vi.fn().mockRejectedValue(new Error("not an image"));
    const file = makeFile(500 * 1024, "image/jpeg");

    const result = await compressImage(file, { maxLongEdge: 1600 });

    expect(result.wasCompressed).toBe(false);
    expect(result.file).toBe(file);
  });

  it("outputs a renamed file matching the requested mime type", async () => {
    mockCanvasPipeline({
      bitmapWidth: 2000,
      bitmapHeight: 2000,
      outputBytes: 200 * 1024,
      outputType: "image/webp",
    });
    const file = makeFile(1024 * 1024, "image/png", "logo.png");

    const result = await compressImage(file, { maxLongEdge: 1024, mimeType: "image/webp" });

    expect(result.file.type).toBe("image/webp");
    expect(result.file.name).toBe("logo.webp");
  });
});

import {
  compressImage,
  computeTargetDimensions,
  DEFAULT_SKIP_BELOW_BYTES,
  isRasterImageAsset,
  shouldSkipCompression,
  type CompressibleAsset,
} from "@/lib/media/compress-image";

const mockManipulate = jest.fn();
const mockResize = jest.fn();
const mockRenderAsync = jest.fn();
const mockSaveAsync = jest.fn();

jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: {
    manipulate: (...args: unknown[]): unknown => mockManipulate(...args) as unknown,
  },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));

function asset(overrides: Partial<CompressibleAsset> = {}): CompressibleAsset {
  return {
    uri: "file:///tmp/photo.jpg",
    width: 4000,
    height: 3000,
    fileSize: 5 * 1024 * 1024,
    mimeType: "image/jpeg",
    ...overrides,
  };
}

describe("computeTargetDimensions", () => {
  it("scales down a landscape photo so the width hits the cap", () => {
    expect(computeTargetDimensions(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it("scales down a portrait photo so the height hits the cap", () => {
    expect(computeTargetDimensions(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("leaves a photo already within bounds untouched", () => {
    expect(computeTargetDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("returns the input as-is when the long edge is zero", () => {
    expect(computeTargetDimensions(0, 0, 1600)).toEqual({ width: 0, height: 0 });
  });
});

describe("isRasterImageAsset", () => {
  it("accepts common raster types", () => {
    expect(isRasterImageAsset("image/jpeg")).toBe(true);
    expect(isRasterImageAsset("image/png")).toBe(true);
  });

  it("rejects SVG/ICO and unknown mime types", () => {
    expect(isRasterImageAsset("image/svg+xml")).toBe(false);
    expect(isRasterImageAsset("image/x-icon")).toBe(false);
    expect(isRasterImageAsset(undefined)).toBe(false);
  });

  it("rejects non-image types such as a PDF", () => {
    expect(isRasterImageAsset("application/pdf")).toBe(false);
  });
});

describe("shouldSkipCompression", () => {
  it("skips assets below the default threshold", () => {
    expect(shouldSkipCompression(asset({ fileSize: DEFAULT_SKIP_BELOW_BYTES - 1 }))).toBe(true);
  });

  it("does not skip a large raster photo", () => {
    expect(shouldSkipCompression(asset({ fileSize: DEFAULT_SKIP_BELOW_BYTES + 1 }))).toBe(false);
  });

  it("skips a non-image asset regardless of size", () => {
    expect(
      shouldSkipCompression(asset({ mimeType: "application/pdf", fileSize: 5 * 1024 * 1024 })),
    ).toBe(true);
  });

  it("does not skip on size alone when the picker reported no fileSize", () => {
    expect(shouldSkipCompression(asset({ fileSize: undefined }))).toBe(false);
  });
});

describe("compressImage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRenderAsync.mockResolvedValue({ saveAsync: mockSaveAsync });
    mockResize.mockImplementation(() => ({ renderAsync: mockRenderAsync }));
    mockManipulate.mockImplementation(() => ({
      resize: mockResize,
      renderAsync: mockRenderAsync,
    }));
  });

  it("skips small assets without calling the manipulator", async () => {
    const result = await compressImage(asset({ fileSize: 1000 }), { maxLongEdge: 1600 });
    expect(result.wasCompressed).toBe(false);
    expect(mockManipulate).not.toHaveBeenCalled();
  });

  it("passes a PDF through untouched", async () => {
    const input = asset({ mimeType: "application/pdf", fileSize: 5 * 1024 * 1024 });
    const result = await compressImage(input, { maxLongEdge: 1600 });
    expect(result).toEqual({
      uri: input.uri,
      width: input.width,
      height: input.height,
      wasCompressed: false,
    });
    expect(mockManipulate).not.toHaveBeenCalled();
  });

  it("resizes and re-encodes a large photo to JPEG", async () => {
    mockSaveAsync.mockResolvedValue({
      uri: "file:///tmp/compressed.jpg",
      width: 1600,
      height: 1200,
    });

    const result = await compressImage(asset(), { maxLongEdge: 1600, quality: 0.8 });

    expect(mockManipulate).toHaveBeenCalledWith("file:///tmp/photo.jpg");
    expect(mockResize).toHaveBeenCalledWith({ width: 1600, height: 1200 });
    expect(mockSaveAsync).toHaveBeenCalledWith({ compress: 0.8, format: "jpeg" });
    expect(result).toEqual({
      uri: "file:///tmp/compressed.jpg",
      width: 1600,
      height: 1200,
      wasCompressed: true,
    });
  });

  it("skips the resize step when the photo is already within bounds, but still re-encodes it (stripping EXIF)", async () => {
    mockSaveAsync.mockResolvedValue({ uri: "file:///tmp/compressed.jpg", width: 800, height: 600 });

    await compressImage(asset({ width: 800, height: 600 }), { maxLongEdge: 1600 });

    expect(mockResize).not.toHaveBeenCalled();
    expect(mockRenderAsync).toHaveBeenCalled();
    expect(mockSaveAsync).toHaveBeenCalled();
  });

  it("falls back to the original asset when the manipulator throws", async () => {
    mockManipulate.mockImplementation(() => {
      throw new Error("native module unavailable");
    });

    const input = asset();
    const result = await compressImage(input, { maxLongEdge: 1600 });

    expect(result).toEqual({
      uri: input.uri,
      width: input.width,
      height: input.height,
      wasCompressed: false,
    });
  });

  it("falls back to the original asset when saveAsync rejects", async () => {
    mockSaveAsync.mockRejectedValue(new Error("disk full"));

    const input = asset();
    const result = await compressImage(input, { maxLongEdge: 1600 });

    expect(result).toEqual({
      uri: input.uri,
      width: input.width,
      height: input.height,
      wasCompressed: false,
    });
  });
});

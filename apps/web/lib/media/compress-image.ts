/**
 * Client-side image preprocessing run before every presigned upload
 * (avatar, leave-request evidence, discipline attachments, branding
 * logo/favicon): phones routinely produce 3-5 MB photos, and sending
 * those as-is both grows object storage (~8 GB/month at 1,000 students)
 * and forces the API to decode a large image just to strip EXIF
 * (docs/08-security.md section 6). Downsizing and re-encoding here cuts
 * both costs before the bytes ever leave the browser.
 *
 * The server remains the authority: it still sniffs content type,
 * re-decodes to strip EXIF, and enforces its own size ceiling regardless
 * of what this helper produced (defense in depth, not a replacement for
 * that check).
 */

/** Below this size, compressing rarely helps and only adds latency/CPU. */
export const DEFAULT_SKIP_BELOW_BYTES = 400 * 1024;

/** ~0.8 JPEG quality, per the task's target compression ratio. */
export const DEFAULT_QUALITY = 0.8;

// SVG and ICO are vector/container formats a raster canvas cannot
// (and must not) re-encode -- branding logos of these types pass through
// untouched, matching apps/api's AllowedBrandingImageTypes for SVG and
// the "do NOT convert SVG/ICO" rule.
const NON_RASTER_IMAGE_TYPES = new Set([
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

export type CompressibleMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface CompressImageOptions {
  /** Longest edge (width or height) the output is scaled down to. Never upscales. */
  maxLongEdge: number;
  /** 0-1 JPEG/WebP quality. Ignored for PNG. Defaults to DEFAULT_QUALITY. */
  quality?: number;
  /** Output content type. Defaults to "image/jpeg". Must be one apps/api's sniffing/allowlist accepts for the target upload. */
  mimeType?: CompressibleMimeType;
  /** Files smaller than this pass through unchanged. Defaults to DEFAULT_SKIP_BELOW_BYTES. */
  skipBelowBytes?: number;
}

export interface CompressImageResult {
  file: File;
  wasCompressed: boolean;
  originalSize: number;
  compressedSize: number;
}

/** True for a file a canvas can decode and re-encode -- any raster image type, excluding SVG/ICO. PDFs and other non-images are always false. */
export function isRasterImageFile(file: File): boolean {
  return file.type.startsWith("image/") && !NON_RASTER_IMAGE_TYPES.has(file.type);
}

/** Files this helper leaves untouched: non-images, SVG/ICO, and anything already small enough that re-encoding is not worth the cost. */
export function shouldSkipCompression(
  file: File,
  skipBelowBytes: number = DEFAULT_SKIP_BELOW_BYTES,
): boolean {
  return !isRasterImageFile(file) || file.size < skipBelowBytes;
}

/** Scales (width, height) down so the long edge is at most maxLongEdge, preserving aspect ratio. Never upscales -- an image already within bounds is returned as-is. */
export function computeTargetDimensions(
  width: number,
  height: number,
  maxLongEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= 0 || longEdge <= maxLongEdge) return { width, height };
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Human-readable size for the "compressed to X" hint shown next to an upload preview. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function canCompressInThisEnvironment(): boolean {
  return (
    typeof createImageBitmap === "function" &&
    (typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined")
  );
}

function extensionFor(mimeType: CompressibleMimeType): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function withExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${ext}`;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

// Prefers OffscreenCanvas (works without touching the DOM); falls back to
// a plain <canvas> element for browsers whose OffscreenCanvas cannot
// convertToBlob (older Safari). Returns null if neither path can render,
// which the caller treats as "skip compression, use the original file".
async function renderToBlob(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, width, height);
        return await canvas.convertToBlob({ type: mimeType, quality });
      }
    } catch {
      // Fall through to the HTMLCanvasElement path below.
    }
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvasToBlob(canvas, mimeType, quality);
  }
  return null;
}

/**
 * Downsizes and re-encodes an image file before it is handed to a
 * presigned upload. Respects EXIF orientation (createImageBitmap's
 * "from-image" option), strips all other metadata as a side effect of
 * re-encoding through a canvas, and skips files that are not images, are
 * SVG/ICO, or are already small (shouldSkipCompression). Falls back to
 * the original file untouched whenever the environment lacks canvas
 * support or the re-encode fails for any reason -- this never throws and
 * never blocks an upload.
 */
export async function compressImage(
  file: File,
  options: CompressImageOptions,
): Promise<CompressImageResult> {
  const originalSize = file.size;
  const passthrough: CompressImageResult = {
    file,
    wasCompressed: false,
    originalSize,
    compressedSize: originalSize,
  };

  if (shouldSkipCompression(file, options.skipBelowBytes) || !canCompressInThisEnvironment()) {
    return passthrough;
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const target = computeTargetDimensions(bitmap.width, bitmap.height, options.maxLongEdge);
    const mimeType = options.mimeType ?? "image/jpeg";
    const quality = options.quality ?? DEFAULT_QUALITY;

    const blob = await renderToBlob(bitmap, target.width, target.height, mimeType, quality);
    bitmap.close();

    if (!blob || blob.size >= originalSize) return passthrough;

    const compressedFile = new File([blob], withExtension(file.name, extensionFor(mimeType)), {
      type: mimeType,
      lastModified: file.lastModified,
    });
    return {
      file: compressedFile,
      wasCompressed: true,
      originalSize,
      compressedSize: compressedFile.size,
    };
  } catch {
    return passthrough;
  }
}

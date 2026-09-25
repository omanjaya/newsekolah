import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/**
 * Mobile counterpart of apps/web's lib/media/compress-image.ts: downsizes
 * and re-encodes a picked photo before it is handed to a presigned upload
 * (avatar, leave-request evidence, discipline attachments), for the same
 * reason -- phones routinely produce 3-5 MB photos, which both grows
 * object storage (~8 GB/month at 1,000 students) and forces the API to
 * decode a large image just to strip EXIF (docs/08-security.md section
 * 6). The server remains the authority: it still sniffs content type,
 * re-decodes to strip EXIF, and enforces its own size ceiling regardless
 * of what this helper produced.
 *
 * expo-image-manipulator already applies a photo's EXIF orientation when
 * it resizes/re-encodes (it never leaves a sideways JPEG), which strips
 * that and all other EXIF metadata as a side effect -- there is no
 * separate orientation step to ask for here, unlike the web helper's
 * `imageOrientation: "from-image"` canvas option.
 */

/** Below this size, compressing rarely helps and only adds latency/battery. */
export const DEFAULT_SKIP_BELOW_BYTES = 400 * 1024;

/** ~0.8 JPEG quality, per the task's target compression ratio. */
export const DEFAULT_QUALITY = 0.8;

// SVG and ICO are vector/container formats expo-image-manipulator cannot
// (and must not) re-encode -- matches the web helper's NON_RASTER_IMAGE_TYPES.
const NON_RASTER_IMAGE_TYPES = new Set([
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

/**
 * The minimal shape this helper needs from a picked asset --
 * expo-image-picker's ImagePickerAsset and expo-camera's CameraCapturedPicture
 * both satisfy it, so no adapter is needed once a mobile upload screen
 * exists to call this.
 */
export interface CompressibleAsset {
  uri: string;
  width: number;
  height: number;
  fileSize?: number;
  mimeType?: string;
}

export interface CompressImageOptions {
  /** Longest edge (width or height) the output is scaled down to. Never upscales. */
  maxLongEdge: number;
  /** 0-1 compression quality. Defaults to DEFAULT_QUALITY. */
  quality?: number;
  /** Files smaller than this pass through unchanged. Defaults to DEFAULT_SKIP_BELOW_BYTES. */
  skipBelowBytes?: number;
}

export interface CompressImageResult {
  uri: string;
  width: number;
  height: number;
  wasCompressed: boolean;
}

/** True for an asset expo-image-manipulator can decode and re-encode -- any raster image type, excluding SVG/ICO. PDFs and other non-images are always false. */
export function isRasterImageAsset(mimeType: string | undefined): boolean {
  return !!mimeType && mimeType.startsWith("image/") && !NON_RASTER_IMAGE_TYPES.has(mimeType);
}

/** Assets this helper leaves untouched: non-images, SVG/ICO, and anything already small enough that re-encoding is not worth the cost. An asset with no known fileSize is never skipped on size alone -- better to compress unnecessarily than to skip a large upload just because the picker did not report a size. */
export function shouldSkipCompression(
  asset: CompressibleAsset,
  skipBelowBytes: number = DEFAULT_SKIP_BELOW_BYTES,
): boolean {
  if (!isRasterImageAsset(asset.mimeType)) return true;
  return asset.fileSize != null && asset.fileSize < skipBelowBytes;
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

/**
 * Downsizes and re-encodes a picked photo to JPEG before it is handed to
 * a presigned upload. Skips assets that are not images, are SVG/ICO, or
 * are already small (shouldSkipCompression). Falls back to the original
 * asset untouched if the manipulator throws for any reason -- this never
 * blocks an upload.
 */
export async function compressImage(
  asset: CompressibleAsset,
  options: CompressImageOptions,
): Promise<CompressImageResult> {
  const passthrough: CompressImageResult = {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    wasCompressed: false,
  };

  if (shouldSkipCompression(asset, options.skipBelowBytes)) return passthrough;

  const target = computeTargetDimensions(asset.width, asset.height, options.maxLongEdge);
  const needsResize = target.width !== asset.width || target.height !== asset.height;

  try {
    let context = ImageManipulator.manipulate(asset.uri);
    if (needsResize) context = context.resize({ width: target.width, height: target.height });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      compress: options.quality ?? DEFAULT_QUALITY,
      format: SaveFormat.JPEG,
    });
    return { uri: saved.uri, width: saved.width, height: saved.height, wasCompressed: true };
  } catch {
    return passthrough;
  }
}

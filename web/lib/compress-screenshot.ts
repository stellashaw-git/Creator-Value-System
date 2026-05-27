/** Client-side screenshot compression before OpenAI upload. */

export const SCREENSHOT_MAX_DIM = 900;
export const SCREENSHOT_COMPRESS_QUALITY = 0.65;

export async function compressScreenshot(file: File): Promise<File> {
  const originalSize = file.size;
  const type = (file.type || "").toLowerCase();
  const isImage =
    type.startsWith("image/") ||
    type === "application/octet-stream" ||
    !type ||
    /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name);
  if (!isImage) return file;

  try {
    const img = await createImageBitmap(file);
    const ratio = Math.min(SCREENSHOT_MAX_DIM / img.width, SCREENSHOT_MAX_DIM / img.height, 1);
    if (ratio === 1 && file.size < 280 * 1024) {
      console.log("[Screenshot compress]", {
        name: file.name,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1,
        skipped: "already_small",
        dimensions: `${img.width}x${img.height}`,
      });
      img.close();
      return file;
    }
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      img.close();
      return file;
    }
    ctx.drawImage(img, 0, 0, w, h);
    img.close();
    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", SCREENSHOT_COMPRESS_QUALITY);
    });
    if (!blob) return file;
    const compressedSize = blob.size;
    console.log("[Screenshot compress]", {
      name: file.name,
      originalSize,
      compressedSize,
      compressionRatio: Number((compressedSize / originalSize).toFixed(3)),
      outputDimensions: `${w}x${h}`,
      format: "image/jpeg",
    });
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
    });
  } catch (err) {
    console.log("[Screenshot compress]", {
      name: file.name,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
      skipped: "compress_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return file;
  }
}

export function dedupeScreenshotFiles(files: File[]): File[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.name}:${file.size}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function fileFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

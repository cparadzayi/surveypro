/**
 * Prepares an uploaded firm logo for the letterhead: crops its empty margins and shrinks it to a PNG small
 * enough to store and to embed in every cover letter.
 *
 * A logo exported from a document usually carries a wide blank border (the one this was built for sat in a
 * 1367 x 1100 frame with the artwork off to one side). Placed as it is, that border would leave a large gap
 * at the top of the letter, so the empty margins go. The server accepts only a PNG within 512 KB and 2000
 * px a side; this keeps well inside both.
 */

export interface Bounds { x: number; y: number; width: number; height: number }

/** Longest side of the stored logo, pixels. A letterhead draws it about 25 mm high, so this is plenty. */
export const LOGO_MAX_SIDE = 800;
/** Target size of the PNG, bytes; the server's limit is 512 KB, so there is headroom. */
export const LOGO_TARGET_BYTES = 400 * 1024;
/** The largest file read, bytes. */
export const LOGO_MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * The box round everything that is not background in RGBA pixels, or null when the image is all background.
 * A pixel is background when it is (nearly) transparent or (nearly) white.
 */
export function trimBounds(
  data: ArrayLike<number>, width: number, height: number, whiteFrom = 245, alphaBelow = 16,
): Bounds | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      const background = a < alphaBelow || (data[i] >= whiteFrom && data[i + 1] >= whiteFrom && data[i + 2] >= whiteFrom);
      if (background) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Grows a box by `pad` pixels on each side, kept inside a width x height image. */
export function padBounds(b: Bounds, pad: number, width: number, height: number): Bounds {
  const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad);
  return { x, y, width: Math.min(width, b.x + b.width + pad) - x, height: Math.min(height, b.y + b.height + pad) - y };
}

/** The size that fits width x height within `max` on its longer side, never enlarging. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** The decoded size of a base64 data URL's payload, bytes. */
export function dataUrlBytes(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

export interface PreparedLogo { dataUrl: string; width: number; height: number }

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
    img.src = url;
  });
}

/** Reads an image file, crops its empty margins, and returns a PNG data URL within the stored limits. */
export async function prepareLogo(file: File): Promise<PreparedLogo> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Choose a PNG, JPEG, WebP or GIF image.');
  if (file.size > LOGO_MAX_FILE_BYTES) throw new Error('That image is larger than 10 MB.');

  const img = await loadImage(file);
  const sw = img.naturalWidth, sh = img.naturalHeight;
  if (!sw || !sh) throw new Error('That image has no size.');

  const full = document.createElement('canvas');
  full.width = sw; full.height = sh;
  const fctx = full.getContext('2d', { willReadFrequently: true });
  if (!fctx) throw new Error('This browser cannot process images.');
  fctx.drawImage(img, 0, 0);
  const box = trimBounds(fctx.getImageData(0, 0, sw, sh).data, sw, sh);
  if (!box) throw new Error('That image is blank.');
  const crop = padBounds(box, 2, sw, sh);

  // Shrink until it fits: first to the longest allowed side, then by a fifth at a time if the PNG is still large.
  let scale = fitWithin(crop.width, crop.height, LOGO_MAX_SIDE);
  for (let attempt = 0; attempt < 8; attempt++) {
    const out = document.createElement('canvas');
    out.width = scale.width; out.height = scale.height;
    const octx = out.getContext('2d');
    if (!octx) throw new Error('This browser cannot process images.');
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(full, crop.x, crop.y, crop.width, crop.height, 0, 0, scale.width, scale.height);
    const dataUrl = out.toDataURL('image/png');
    if (dataUrlBytes(dataUrl) <= LOGO_TARGET_BYTES) return { dataUrl, width: scale.width, height: scale.height };
    scale = { width: Math.max(16, Math.round(scale.width * 0.8)), height: Math.max(16, Math.round(scale.height * 0.8)) };
  }
  throw new Error('That image is too detailed to store. Try a simpler or smaller logo.');
}

import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { detectAndValidateImageFormat } from './canvasHelpers';

/**
 * Maximum UTF-8 byte length supported by QR Version 40 at Error Correction level M.
 */
export const MAX_QR_UTF8_BYTES = 2331;
export const MAX_QR_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_QR_DIMENSION = 4096; // 4K max dimension for QR images
export const MAX_QR_PIXELS = 4_000_000; // ~4 MP cap

export interface QrPngResult {
  pngBytes: Uint8Array;
  rgbaPixels: Uint8ClampedArray;
  width: number;
  height: number;
  version: number;
  moduleCount: number;
}

// Precomputed CRC-32 lookup table for valid PNG chunks
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  chunk[4] = type.charCodeAt(0);
  chunk[5] = type.charCodeAt(1);
  chunk[6] = type.charCodeAt(2);
  chunk[7] = type.charCodeAt(3);
  chunk.set(data, 8);
  const crc = crc32(chunk.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crc, false);
  return chunk;
}

export const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export function hasValidPngSignature(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Validates PNG signature and inspects the IHDR chunk.
 */
export function validatePngStructure(bytes: Uint8Array): {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
} {
  if (!hasValidPngSignature(bytes)) {
    throw new Error('Invalid PNG signature.');
  }

  if (bytes.length < 33) {
    // 8 signature + 12 IHDR chunk (4 len + 4 type + 13 data + 4 crc = 25B minimum)
    throw new Error('PNG stream is truncated or too small for IHDR.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ihdrLen = view.getUint32(8, false);
  if (ihdrLen !== 13) {
    throw new Error('Invalid PNG IHDR chunk length.');
  }

  const ihdrType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (ihdrType !== 'IHDR') {
    throw new Error(`Expected IHDR chunk, found "${ihdrType}".`);
  }

  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  const bitDepth = bytes[24];
  const colorType = bytes[25];

  if (width === 0 || height === 0) {
    throw new Error('Invalid PNG image dimensions (0x0).');
  }

  if (width > MAX_QR_DIMENSION || height > MAX_QR_DIMENSION) {
    throw new Error(`PNG dimension ${width}×${height} exceeds maximum QR dimension of ${MAX_QR_DIMENSION}px.`);
  }

  return { width, height, bitDepth, colorType };
}

async function compressDeflateZlib(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('CompressionStream API is unavailable for QR PNG encoding.');
  }
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  const writePromise = (async () => {
    await writer.write(raw as BufferSource);
    await writer.close();
  })();
  const buffer = await new Response(cs.readable).arrayBuffer();
  await writePromise;
  return new Uint8Array(buffer);
}

/**
 * Encodes a secret UTF-8 text string into a valid, high-contrast scannable
 * 8-bit grayscale PNG QR code image (`image/png`), completely in-memory with
 * zero DOM dependency so it runs identically in browsers and Node tests.
 */
export async function encodeQrToPngBytes(
  text: string,
  scale = 6,
  marginModules = 4
): Promise<QrPngResult> {
  if (!text) {
    throw new Error('Cannot generate a QR code for an empty message.');
  }
  const utf8Bytes = new TextEncoder().encode(text);
  if (utf8Bytes.length > MAX_QR_UTF8_BYTES) {
    throw new Error(
      `QR code mode supports up to ${MAX_QR_UTF8_BYTES.toLocaleString()} UTF-8 bytes (current message is ${utf8Bytes.length.toLocaleString()} bytes).`
    );
  }

  // Encode explicitly in QR byte mode so UTF-8 languages (Tamil, Japanese, emoji) round-trip cleanly
  const qr = QRCode.create([{ data: utf8Bytes, mode: 'byte' }], {
    errorCorrectionLevel: 'M',
  });

  const moduleCount = qr.modules.size;
  const width = (moduleCount + marginModules * 2) * scale;
  const height = width;

  if (width > MAX_QR_DIMENSION || height > MAX_QR_DIMENSION) {
    throw new Error(`Generated QR dimension exceeds ${MAX_QR_DIMENSION}px limit.`);
  }

  // Build 8-bit grayscale scanlines (filter byte 0x00 + pixel luminance per row)
  const stride = 1 + width;
  const rawScanlines = new Uint8Array(stride * height);
  rawScanlines.fill(255); // White quiet zone & light modules

  const rgbaPixels = new Uint8ClampedArray(width * height * 4);
  rgbaPixels.fill(255);

  for (let row = 0; row < height; row++) {
    rawScanlines[row * stride] = 0; // PNG filter type 0 (None)
  }

  for (let my = 0; my < moduleCount; my++) {
    for (let mx = 0; mx < moduleCount; mx++) {
      const isDark = qr.modules.get(my, mx) !== 0;
      if (!isDark) continue;

      const startX = (mx + marginModules) * scale;
      const startY = (my + marginModules) * scale;

      for (let dy = 0; dy < scale; dy++) {
        const y = startY + dy;
        const scanRowOffset = y * stride + 1;
        const rgbaRowOffset = y * width * 4;

        for (let dx = 0; dx < scale; dx++) {
          const x = startX + dx;
          rawScanlines[scanRowOffset + x] = 17;
          const p = rgbaRowOffset + x * 4;
          rgbaPixels[p] = 17;
          rgbaPixels[p + 1] = 17;
          rgbaPixels[p + 2] = 20;
          rgbaPixels[p + 3] = 255;
        }
      }
    }
  }

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdrData[8] = 8; // 8-bit grayscale
  ihdrData[9] = 0; // Color type 0 = Grayscale
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const compressed = await compressDeflateZlib(rawScanlines);

  const ihdrChunk = makePngChunk('IHDR', ihdrData);
  const idatChunk = makePngChunk('IDAT', compressed);
  const iendChunk = makePngChunk('IEND', new Uint8Array(0));

  const pngBytes = new Uint8Array(
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length
  );
  let offset = 0;
  pngBytes.set(signature, offset);
  offset += signature.length;
  pngBytes.set(ihdrChunk, offset);
  offset += ihdrChunk.length;
  pngBytes.set(idatChunk, offset);
  offset += idatChunk.length;
  pngBytes.set(iendChunk, offset);

  return {
    pngBytes,
    rgbaPixels,
    width,
    height,
    version: qr.version,
    moduleCount,
  };
}

/**
 * Decodes a QR code directly from RGBA pixel buffer (works in Node tests and Browser).
 */
export function decodeQrFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): string {
  if (width <= 0 || height <= 0) {
    throw new Error('Invalid dimensions for QR decoding.');
  }
  if (rgba.length < width * height * 4) {
    throw new Error('RGBA pixel buffer is smaller than specified dimensions.');
  }

  const decoded = jsQR(rgba, width, height, { inversionAttempts: 'attemptBoth' });
  if (!decoded) {
    throw new Error('Could not decode the embedded QR code image.');
  }
  if (decoded.binaryData && decoded.binaryData.length > 0) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(decoded.binaryData));
    } catch {
      // Fallback to jsQR's decoded string if byte buffer is non-UTF-8
    }
  }
  return decoded.data;
}

/**
 * Browser helper: decodes a PNG byte array representing a QR code image into text.
 */
export async function decodeQrPngBytesInBrowser(pngBytes: Uint8Array): Promise<string> {
  validatePngStructure(pngBytes);

  const blob = new Blob([pngBytes as BlobPart], { type: 'image/png' });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for QR decoding.');
  }

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      if (bitmap.width > MAX_QR_DIMENSION || bitmap.height > MAX_QR_DIMENSION) {
        throw new Error('QR image dimensions exceed maximum limits.');
      }
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      ctx.drawImage(bitmap, 0, 0);
    } finally {
      bitmap.close();
    }
  } else {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Failed to decode QR PNG image.'));
        el.src = url;
      });
      if (img.naturalWidth > MAX_QR_DIMENSION || img.naturalHeight > MAX_QR_DIMENSION) {
        throw new Error('QR image dimensions exceed maximum limits.');
      }
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return decodeQrFromRgba(imageData.data, canvas.width, canvas.height);
}

/**
 * Decodes any uploaded QR code image file (PNG, JPG, WebP) in browser.
 * Re-encodes uploaded JPEG and WebP QR images as clean lossless PNG before returning,
 * ensuring that embedded payloads are always pristine PNGs.
 */
export async function decodeQrImageFile(file: File): Promise<{
  text: string;
  previewUrl: string;
  width: number;
  height: number;
  pngBytes: Uint8Array;
}> {
  if (file.size === 0) {
    throw new Error('The selected QR image file is empty.');
  }
  if (file.size > MAX_QR_FILE_SIZE_BYTES) {
    throw new Error(
      `QR image file size exceeds the 10 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`
    );
  }

  const format = await detectAndValidateImageFormat(file);

  const url = URL.createObjectURL(file);
  let text = '';
  let imgWidth = 0;
  let imgHeight = 0;

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode QR code image file.'));
      el.src = url;
    });

    imgWidth = img.naturalWidth;
    imgHeight = img.naturalHeight;

    if (!imgWidth || !imgHeight || imgWidth <= 0 || imgHeight <= 0) {
      throw new Error('QR image dimensions are invalid.');
    }

    if (imgWidth > MAX_QR_DIMENSION || imgHeight > MAX_QR_DIMENSION) {
      throw new Error(`QR image dimension (${imgWidth}×${imgHeight}) exceeds maximum ${MAX_QR_DIMENSION}px limit.`);
    }

    if (imgWidth * imgHeight > MAX_QR_PIXELS) {
      throw new Error('QR image contains too many pixels for browser processing.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = imgWidth;
    canvas.height = imgHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    text = decodeQrFromRgba(imageData.data, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }

  if (!text) {
    throw new Error('No valid QR code could be scanned or detected in this file.');
  }

  // Re-encode into a pristine, lossless grayscale PNG byte stream
  // This guarantees that whether the input was JPG, WebP, or PNG, the embedded payload is ALWAYS clean PNG.
  const reEncoded = await encodeQrToPngBytes(text);

  const previewBlob = new Blob([reEncoded.pngBytes as BlobPart], { type: 'image/png' });
  const previewUrl = URL.createObjectURL(previewBlob);

  return {
    text,
    previewUrl,
    width: reEncoded.width,
    height: reEncoded.height,
    pngBytes: reEncoded.pngBytes,
  };
}

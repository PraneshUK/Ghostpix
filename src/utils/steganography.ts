/**
 * Ghostpix Steganography Subsystem
 *
 * Provides LSB (Least Significant Bit) steganography for encoding and extracting
 * data within the R, G, B channels of uncompressed RGBA pixel buffers.
 *
 * Implements:
 * - Versioned GPX2 format with cryptographic metadata, KDF parameters, salt, nonce, and CRC-32 header verification.
 * - Password-derived pseudo-random embedding distribution using a cycle-walking Feistel permutation (O(1) memory).
 * - Full backward compatibility with legacy GPX1 images.
 * - Alpha channel flattening to prevent canvas export premultiplication distortion.
 *
 * SECURITY NOTE ON STEGANALYSIS:
 * While randomized LSB embedding eliminates localized sequential step-changes in LSB entropy,
 * it does NOT make an image undetectable against rigorous statistical steganalysis
 * (such as Sample Pair Analysis, RS Steganography Analysis, or Chi-Squared distribution tests).
 * Any claim of statistical undetectability is scientifically invalid.
 */

import {
  DEFAULT_PBKDF2_ITERATIONS,
  KDF_PBKDF2_SHA256,
  SALT_LENGTH,
  IV_LENGTH,
} from './crypto';

// Magic signatures
export const MAGIC_GPX1 = [0x47, 0x50, 0x58, 0x31] as const; // "GPX1"
export const MAGIC_GPX2 = [0x47, 0x50, 0x58, 0x32] as const; // "GPX2"
export const MAGIC_BYTES = MAGIC_GPX1; // Legacy export alias

// Flags
export const FLAG_PLAIN = 0x00;
export const FLAG_ENCRYPTED = 0x01;
export const FLAG_QR_IMAGE = 0x02;
export const FLAG_RANDOMIZED = 0x04;

// Header Byte Counts
export const HEADER_BYTES_V1 = 9;  // 4B magic + 1B flag + 4B length
export const HEADER_BYTES_V2 = 47; // 4B magic + 1B ver + 1B flag + 1B kdfId + 4B iter + 4B len + 16B salt + 12B iv + 4B crc
export const HEADER_BYTES = HEADER_BYTES_V1; // Legacy export alias

export type StegoErrorCode =
  | 'INVALID_IMAGE_DATA'
  | 'EMPTY_PAYLOAD'
  | 'CAPACITY_EXCEEDED'
  | 'NO_HIDDEN_MESSAGE'
  | 'CORRUPTED_MESSAGE'
  | 'PASSWORD_REQUIRED';

export class SteganographyError extends Error {
  code: StegoErrorCode;

  constructor(code: StegoErrorCode, message: string) {
    super(message);
    this.name = 'SteganographyError';
    this.code = code;
  }
}

export interface EmbedResult {
  pixels: Uint8ClampedArray;
  version: 1 | 2;
  bitsWritten: number;
  changedBits: number;
  modifiedPixelCount: number;
  headerBytes: number;
  payloadBytes: number;
}

export interface ExtractResult {
  payload: Uint8Array;
  version: 1 | 2;
  isEncrypted: boolean;
  isQrImage: boolean;
  isRandomized: boolean;
  payloadBytes: number;
  kdfId?: number;
  kdfIterations?: number;
  salt?: Uint8Array;
  iv?: Uint8Array;
}

export interface HeaderPeekResult {
  hasGhostpixHeader: boolean;
  version: 1 | 2 | 0;
  isEncrypted: boolean;
  isQrImage: boolean;
  isRandomized: boolean;
  payloadBytes: number;
  kdfId?: number;
  kdfIterations?: number;
  salt?: Uint8Array;
  iv?: Uint8Array;
  isCorrupted?: boolean;
}

export interface PixelCellInspection {
  x: number;
  y: number;
  origR: number;
  origG: number;
  origB: number;
  modR: number;
  modG: number;
  modB: number;
  rChanged: boolean;
  gChanged: boolean;
  bChanged: boolean;
  origLsbs: string;
  modLsbs: string;
}

// Precomputed CRC-32 lookup table
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

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Fast 4-round cycle-walking Feistel permutation.
 * Maps any index in [0, domainSize - 1] to a unique pseudo-random index in [0, domainSize - 1].
 * Strictly guarantees a 1-to-1 bijection with zero memory allocation.
 */
export function feistelPermute(
  index: number,
  domainSize: number,
  roundKeys: Uint32Array
): number {
  if (domainSize <= 1) return 0;

  let k = 1;
  while ((1 << k) * (1 << k) < domainSize) {
    k++;
  }
  const w = 1 << k;
  const mask = w - 1;

  let current = index;
  // Cycle walking: if current >= domainSize, continue round walking until it falls within range
  while (true) {
    let l = (current >> k) & mask;
    let r = current & mask;

    for (let round = 0; round < 4; round++) {
      let h = (r ^ roundKeys[round % roundKeys.length]) >>> 0;
      h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
      h = (h ^ (h >>> 16)) >>> 0;
      const f = h & mask;

      const nextR = (l ^ f) & mask;
      l = r;
      r = nextR;
    }

    current = (l << k) | r;
    if (current < domainSize) {
      return current;
    }
  }
}

/**
 * Creates round keys from a 256-bit seed or default deterministic seed.
 */
export function deriveRoundKeys(seed?: Uint8Array): Uint32Array {
  if (seed && seed.length >= 16) {
    const keys = new Uint32Array(4);
    const view = new DataView(seed.buffer, seed.byteOffset, seed.byteLength);
    keys[0] = view.getUint32(0, true);
    keys[1] = view.getUint32(4, true);
    keys[2] = view.getUint32(8, true);
    keys[3] = view.getUint32(12, true);
    return keys;
  }
  return new Uint32Array([0x85ebca6b, 0xc2b2ae35, 0x1b194747, 0x9e3779b9]);
}

/**
 * Returns maximum payload bytes that fit into `pixelCount` pixels using
 * 3 bits per pixel (R, G, B LSBs; Alpha skipped).
 */
export function calculateCapacityBytes(pixelCount: number, version: 1 | 2 = 2): number {
  if (!Number.isFinite(pixelCount) || pixelCount <= 0) return 0;
  const totalBytes = Math.floor((pixelCount * 3) / 8);
  const headerBytes = version === 1 ? HEADER_BYTES_V1 : HEADER_BYTES_V2;
  return Math.max(0, totalBytes - headerBytes);
}

/**
 * Flattens semi-transparent/transparent RGBA pixels onto an opaque background
 * (alpha = 255) so HTML Canvas PNG export never alters R/G/B LSBs through
 * premultiplied alpha rounding.
 */
export function flattenPixels(
  pixels: Uint8ClampedArray,
  bgR = 7,
  bgG = 7,
  bgB = 13
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a === 255) {
      out[i] = pixels[i];
      out[i + 1] = pixels[i + 1];
      out[i + 2] = pixels[i + 2];
      out[i + 3] = 255;
    } else if (a === 0) {
      out[i] = bgR;
      out[i + 1] = bgG;
      out[i + 2] = bgB;
      out[i + 3] = 255;
    } else {
      const alpha = a / 255;
      const inv = 1 - alpha;
      out[i] = Math.round(pixels[i] * alpha + bgR * inv);
      out[i + 1] = Math.round(pixels[i + 1] * alpha + bgG * inv);
      out[i + 2] = Math.round(pixels[i + 2] * alpha + bgB * inv);
      out[i + 3] = 255;
    }
  }
  return out;
}

export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export interface EmbedOptions {
  version?: 1 | 2;
  isEncrypted?: boolean;
  isQrImage?: boolean;
  isRandomized?: boolean;
  stegoSeed?: Uint8Array;
  kdfId?: number;
  kdfIterations?: number;
  salt?: Uint8Array;
  iv?: Uint8Array;
}

/**
 * Embeds header and payload bits into the LSB of R, G, B channels.
 * Supports versioned GPX2 with randomized embedding and GPX1 legacy.
 */
export function embed(
  sourcePixels: Uint8ClampedArray,
  payload: Uint8Array,
  isEncryptedOrOptions: boolean | EmbedOptions = false,
  isQrImageParam = false
): EmbedResult {
  if (!sourcePixels || sourcePixels.length === 0 || sourcePixels.length % 4 !== 0) {
    throw new SteganographyError('INVALID_IMAGE_DATA', 'Invalid RGBA pixel buffer.');
  }
  if (!payload || payload.length === 0) {
    throw new SteganographyError('EMPTY_PAYLOAD', 'Message cannot be empty.');
  }

  const options: EmbedOptions =
    typeof isEncryptedOrOptions === 'boolean'
      ? {
          version: 2,
          isEncrypted: isEncryptedOrOptions,
          isQrImage: isQrImageParam,
          isRandomized: isEncryptedOrOptions,
        }
      : {
          version: 2,
          isRandomized: isEncryptedOrOptions.isEncrypted ?? false,
          ...isEncryptedOrOptions,
        };

  const version = options.version ?? 2;
  const isEncrypted = !!options.isEncrypted;
  const isQrImage = !!options.isQrImage;
  const isRandomized = !!options.isRandomized;

  const pixelCount = sourcePixels.length / 4;
  const maxPayloadBytes = calculateCapacityBytes(pixelCount, version);
  if (payload.length > maxPayloadBytes) {
    throw new SteganographyError(
      'CAPACITY_EXCEEDED',
      `Message needs ${payload.length} bytes, but this image can hold at most ${maxPayloadBytes} bytes.`
    );
  }

  const out = flattenPixels(sourcePixels);
  const totalChannels = pixelCount * 3;

  let headerBytes: Uint8Array;
  let headerLength: number;

  if (version === 1) {
    headerLength = HEADER_BYTES_V1;
    headerBytes = new Uint8Array(HEADER_BYTES_V1);
    headerBytes[0] = MAGIC_GPX1[0];
    headerBytes[1] = MAGIC_GPX1[1];
    headerBytes[2] = MAGIC_GPX1[2];
    headerBytes[3] = MAGIC_GPX1[3];
    headerBytes[4] =
      (isEncrypted ? FLAG_ENCRYPTED : FLAG_PLAIN) | (isQrImage ? FLAG_QR_IMAGE : 0);
    const view = new DataView(headerBytes.buffer);
    view.setUint32(5, payload.length, false);
  } else {
    // GPX2 format
    headerLength = HEADER_BYTES_V2;
    headerBytes = new Uint8Array(HEADER_BYTES_V2);
    headerBytes[0] = MAGIC_GPX2[0];
    headerBytes[1] = MAGIC_GPX2[1];
    headerBytes[2] = MAGIC_GPX2[2];
    headerBytes[3] = MAGIC_GPX2[3];
    headerBytes[4] = 0x02; // Version 2
    headerBytes[5] =
      (isEncrypted ? FLAG_ENCRYPTED : FLAG_PLAIN) |
      (isQrImage ? FLAG_QR_IMAGE : 0) |
      (isRandomized ? FLAG_RANDOMIZED : 0);
    headerBytes[6] = options.kdfId ?? KDF_PBKDF2_SHA256;

    const view = new DataView(headerBytes.buffer);
    view.setUint32(7, options.kdfIterations ?? DEFAULT_PBKDF2_ITERATIONS, false);
    view.setUint32(11, payload.length, false);

    const salt = options.salt ?? new Uint8Array(SALT_LENGTH);
    const iv = options.iv ?? new Uint8Array(IV_LENGTH);
    headerBytes.set(salt.subarray(0, SALT_LENGTH), 15);
    headerBytes.set(iv.subarray(0, IV_LENGTH), 31);

    // Compute CRC32 of first 43 header bytes
    const headerCrc = crc32(headerBytes.subarray(0, 43));
    view.setUint32(43, headerCrc, false);
  }

  let changedBits = 0;
  const modifiedPixels = new Uint8Array(pixelCount);

  const writeChannelBit = (channelIndex: number, bit: number) => {
    const pixelIndex = Math.floor(channelIndex / 3);
    const channelOffset = channelIndex % 3;
    const byteIdx = pixelIndex * 4 + channelOffset;
    const oldVal = out[byteIdx];
    const newVal = (oldVal & 0xfe) | bit;
    if (newVal !== oldVal) {
      out[byteIdx] = newVal;
      changedBits++;
      modifiedPixels[pixelIndex] = 1;
    }
  };

  // 1. Embed header bits sequentially in the first headerLength * 8 channel slots
  const headerTotalBits = headerLength * 8;
  for (let b = 0; b < headerTotalBits; b++) {
    const byteIndex = b >> 3;
    const bitShift = 7 - (b & 7);
    const targetBit = (headerBytes[byteIndex] >> bitShift) & 1;
    writeChannelBit(b, targetBit);
  }

  // 2. Embed payload bits in remaining carrier channels
  const payloadTotalBits = payload.length * 8;
  const carrierPoolSize = totalChannels - headerTotalBits;

  const roundKeys = deriveRoundKeys(options.stegoSeed);

  for (let b = 0; b < payloadTotalBits; b++) {
    const byteIndex = b >> 3;
    const bitShift = 7 - (b & 7);
    const targetBit = (payload[byteIndex] >> bitShift) & 1;

    let targetChannel: number;
    if (version === 2 && isRandomized) {
      const permutedOffset = feistelPermute(b, carrierPoolSize, roundKeys);
      targetChannel = headerTotalBits + permutedOffset;
    } else {
      targetChannel = headerTotalBits + b;
    }

    writeChannelBit(targetChannel, targetBit);
  }

  let modifiedPixelCount = 0;
  for (let p = 0; p < pixelCount; p++) {
    if (modifiedPixels[p] === 1) modifiedPixelCount++;
  }

  return {
    pixels: out,
    version,
    bitsWritten: headerTotalBits + payloadTotalBits,
    changedBits,
    modifiedPixelCount,
    headerBytes: headerLength,
    payloadBytes: payload.length,
  };
}

/**
 * Extracts header and payload from RGBA pixel data.
 * Supports GPX1 (sequential) and GPX2 (randomized / parameterized).
 */
export function extract(
  pixels: Uint8ClampedArray,
  stegoSeedOrPassword?: Uint8Array
): ExtractResult {
  if (!pixels || pixels.length === 0 || pixels.length % 4 !== 0) {
    throw new SteganographyError('INVALID_IMAGE_DATA', 'Invalid RGBA pixel buffer.');
  }

  const pixelCount = pixels.length / 4;
  const totalChannels = pixelCount * 3;

  if (totalChannels < HEADER_BYTES_V1 * 8) {
    throw new SteganographyError(
      'NO_HIDDEN_MESSAGE',
      'Image is too small to contain a Ghostpix header.'
    );
  }

  const readChannelBit = (channelIndex: number): number => {
    const pixelIndex = Math.floor(channelIndex / 3);
    const channelOffset = channelIndex % 3;
    return pixels[pixelIndex * 4 + channelOffset] & 1;
  };

  const readHeaderBytes = (count: number): Uint8Array => {
    const out = new Uint8Array(count);
    const totalBits = count * 8;
    for (let i = 0; i < totalBits; i++) {
      const bit = readChannelBit(i);
      out[i >> 3] |= bit << (7 - (i & 7));
    }
    return out;
  };

  const magic = readHeaderBytes(4);
  const isV2 =
    magic[0] === MAGIC_GPX2[0] &&
    magic[1] === MAGIC_GPX2[1] &&
    magic[2] === MAGIC_GPX2[2] &&
    magic[3] === MAGIC_GPX2[3];

  const isV1 =
    magic[0] === MAGIC_GPX1[0] &&
    magic[1] === MAGIC_GPX1[1] &&
    magic[2] === MAGIC_GPX1[2] &&
    magic[3] === MAGIC_GPX1[3];

  if (!isV1 && !isV2) {
    throw new SteganographyError(
      'NO_HIDDEN_MESSAGE',
      'No hidden Ghostpix message was found in this image. Make sure it was shared as an uncompressed PNG file.'
    );
  }

  if (isV1) {
    const header = readHeaderBytes(HEADER_BYTES_V1);
    const flag = header[4];
    const validMask = FLAG_ENCRYPTED | FLAG_QR_IMAGE;
    if ((flag & ~validMask) !== 0) {
      throw new SteganographyError(
        'CORRUPTED_MESSAGE',
        'Hidden header flags are corrupted. The image may have been recompressed.'
      );
    }

    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const payloadLength = view.getUint32(5, false);
    const maxPayload = calculateCapacityBytes(pixelCount, 1);
    if (payloadLength === 0 || payloadLength > maxPayload) {
      throw new SteganographyError(
        'CORRUPTED_MESSAGE',
        'Hidden message length is invalid or corrupted. Make sure the file was not re-saved as JPEG.'
      );
    }

    // GPX1 sequential payload read
    const payload = new Uint8Array(payloadLength);
    const startBit = HEADER_BYTES_V1 * 8;
    const totalBits = payloadLength * 8;

    for (let i = 0; i < totalBits; i++) {
      const bit = readChannelBit(startBit + i);
      payload[i >> 3] |= bit << (7 - (i & 7));
    }

    return {
      payload,
      version: 1,
      isEncrypted: (flag & FLAG_ENCRYPTED) !== 0,
      isQrImage: (flag & FLAG_QR_IMAGE) !== 0,
      isRandomized: false,
      payloadBytes: payloadLength,
    };
  }

  // Handle GPX2
  if (totalChannels < HEADER_BYTES_V2 * 8) {
    throw new SteganographyError(
      'CORRUPTED_MESSAGE',
      'Image is too small to contain a complete GPX2 header.'
    );
  }

  const header = readHeaderBytes(HEADER_BYTES_V2);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);

  // Validate CRC32 of first 43 bytes
  const computedCrc = crc32(header.subarray(0, 43));
  const storedCrc = view.getUint32(43, false);
  if (computedCrc !== storedCrc) {
    throw new SteganographyError(
      'CORRUPTED_MESSAGE',
      'Header integrity check (CRC-32) failed. The image was likely modified, corrupted, or recompressed.'
    );
  }

  const flags = header[5];
  const validMask = FLAG_ENCRYPTED | FLAG_QR_IMAGE | FLAG_RANDOMIZED;
  if ((flags & ~validMask) !== 0) {
    throw new SteganographyError(
      'CORRUPTED_MESSAGE',
      'Hidden header flags are invalid or corrupted.'
    );
  }

  const kdfId = header[6];
  const kdfIterations = view.getUint32(7, false);
  const payloadLength = view.getUint32(11, false);
  const maxPayload = calculateCapacityBytes(pixelCount, 2);

  if (payloadLength === 0 || payloadLength > maxPayload) {
    throw new SteganographyError(
      'CORRUPTED_MESSAGE',
      'Hidden message length is invalid or exceeds carrier capacity.'
    );
  }

  const salt = header.slice(15, 31);
  const iv = header.slice(31, 43);

  const isEncrypted = (flags & FLAG_ENCRYPTED) !== 0;
  const isQrImage = (flags & FLAG_QR_IMAGE) !== 0;
  const isRandomized = (flags & FLAG_RANDOMIZED) !== 0;

  const headerTotalBits = HEADER_BYTES_V2 * 8;
  const carrierPoolSize = totalChannels - headerTotalBits;
  const payloadTotalBits = payloadLength * 8;
  const payload = new Uint8Array(payloadLength);

  const roundKeys = deriveRoundKeys(stegoSeedOrPassword);

  for (let b = 0; b < payloadTotalBits; b++) {
    let sourceChannel: number;
    if (isRandomized) {
      const permutedOffset = feistelPermute(b, carrierPoolSize, roundKeys);
      sourceChannel = headerTotalBits + permutedOffset;
    } else {
      sourceChannel = headerTotalBits + b;
    }

    const bit = readChannelBit(sourceChannel);
    payload[b >> 3] |= bit << (7 - (b & 7));
  }

  return {
    payload,
    version: 2,
    isEncrypted,
    isQrImage,
    isRandomized,
    payloadBytes: payloadLength,
    kdfId,
    kdfIterations,
    salt,
    iv,
  };
}

/**
 * Peeks at the steganographic header in O(1) time without reading payload bits.
 */
export function peekHeader(pixels: Uint8ClampedArray): HeaderPeekResult {
  const empty: HeaderPeekResult = {
    hasGhostpixHeader: false,
    version: 0,
    isEncrypted: false,
    isQrImage: false,
    isRandomized: false,
    payloadBytes: 0,
  };

  if (!pixels || pixels.length === 0 || pixels.length % 4 !== 0) {
    return empty;
  }

  const pixelCount = pixels.length / 4;
  const totalChannels = pixelCount * 3;
  if (totalChannels < HEADER_BYTES_V1 * 8) {
    return empty;
  }

  const readChannelBit = (channelIndex: number): number => {
    const pixelIndex = Math.floor(channelIndex / 3);
    const channelOffset = channelIndex % 3;
    return pixels[pixelIndex * 4 + channelOffset] & 1;
  };

  const readHeaderBytes = (count: number): Uint8Array => {
    const out = new Uint8Array(count);
    const totalBits = count * 8;
    for (let i = 0; i < totalBits; i++) {
      const bit = readChannelBit(i);
      out[i >> 3] |= bit << (7 - (i & 7));
    }
    return out;
  };

  const magic = readHeaderBytes(4);
  const isV2 =
    magic[0] === MAGIC_GPX2[0] &&
    magic[1] === MAGIC_GPX2[1] &&
    magic[2] === MAGIC_GPX2[2] &&
    magic[3] === MAGIC_GPX2[3];

  const isV1 =
    magic[0] === MAGIC_GPX1[0] &&
    magic[1] === MAGIC_GPX1[1] &&
    magic[2] === MAGIC_GPX1[2] &&
    magic[3] === MAGIC_GPX1[3];

  if (!isV1 && !isV2) {
    return empty;
  }

  if (isV1) {
    const header = readHeaderBytes(HEADER_BYTES_V1);
    const flag = header[4];
    const validMask = FLAG_ENCRYPTED | FLAG_QR_IMAGE;
    if ((flag & ~validMask) !== 0) {
      return { ...empty, isCorrupted: true };
    }

    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const payloadLength = view.getUint32(5, false);
    const maxPayload = calculateCapacityBytes(pixelCount, 1);
    if (payloadLength === 0 || payloadLength > maxPayload) {
      return { ...empty, isCorrupted: true };
    }

    return {
      hasGhostpixHeader: true,
      version: 1,
      isEncrypted: (flag & FLAG_ENCRYPTED) !== 0,
      isQrImage: (flag & FLAG_QR_IMAGE) !== 0,
      isRandomized: false,
      payloadBytes: payloadLength,
    };
  }

  // V2 Peek
  if (totalChannels < HEADER_BYTES_V2 * 8) {
    return { ...empty, isCorrupted: true };
  }

  const header = readHeaderBytes(HEADER_BYTES_V2);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);

  const computedCrc = crc32(header.subarray(0, 43));
  const storedCrc = view.getUint32(43, false);
  if (computedCrc !== storedCrc) {
    return { ...empty, hasGhostpixHeader: true, isCorrupted: true };
  }

  const flags = header[5];
  const validMask = FLAG_ENCRYPTED | FLAG_QR_IMAGE | FLAG_RANDOMIZED;
  if ((flags & ~validMask) !== 0) {
    return { ...empty, isCorrupted: true };
  }

  const kdfId = header[6];
  const kdfIterations = view.getUint32(7, false);
  const payloadLength = view.getUint32(11, false);
  const maxPayload = calculateCapacityBytes(pixelCount, 2);

  if (payloadLength === 0 || payloadLength > maxPayload) {
    return { ...empty, isCorrupted: true };
  }

  return {
    hasGhostpixHeader: true,
    version: 2,
    isEncrypted: (flags & FLAG_ENCRYPTED) !== 0,
    isQrImage: (flags & FLAG_QR_IMAGE) !== 0,
    isRandomized: (flags & FLAG_RANDOMIZED) !== 0,
    payloadBytes: payloadLength,
    kdfId,
    kdfIterations,
    salt: header.slice(15, 31),
    iv: header.slice(31, 43),
  };
}

/**
 * Inspects a grid of pixels comparing original flattened pixels vs embedded pixels
 * for the "Bit View" visualizer.
 */
export function inspectPixelGrid(
  originalPixels: Uint8ClampedArray,
  encodedPixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  startX = 0,
  startY = 0,
  gridSize = 8
): PixelCellInspection[] {
  const cells: PixelCellInspection[] = [];
  const maxX = Math.min(imageWidth, startX + gridSize);
  const maxY = Math.min(imageHeight, startY + gridSize);

  for (let y = startY; y < maxY; y++) {
    for (let x = startX; x < maxX; x++) {
      const idx = (y * imageWidth + x) * 4;
      const origR = originalPixels[idx] ?? 0;
      const origG = originalPixels[idx + 1] ?? 0;
      const origB = originalPixels[idx + 2] ?? 0;

      const modR = encodedPixels[idx] ?? 0;
      const modG = encodedPixels[idx + 1] ?? 0;
      const modB = encodedPixels[idx + 2] ?? 0;

      cells.push({
        x,
        y,
        origR,
        origG,
        origB,
        modR,
        modG,
        modB,
        rChanged: (origR & 1) !== (modR & 1),
        gChanged: (origG & 1) !== (modG & 1),
        bChanged: (origB & 1) !== (modB & 1),
        origLsbs: `${origR & 1}${origG & 1}${origB & 1}`,
        modLsbs: `${modR & 1}${modG & 1}${modB & 1}`,
      });
    }
  }

  return cells;
}

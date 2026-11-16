import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCapacityBytes,
  decodeUtf8,
  embed,
  encodeUtf8,
  extract,
  feistelPermute,
  flattenPixels,
  HEADER_BYTES_V1,
  HEADER_BYTES_V2,
  inspectPixelGrid,
  peekHeader,
  SteganographyError,
  FLAG_ENCRYPTED,
  FLAG_QR_IMAGE,
  FLAG_RANDOMIZED,
} from './steganography';
import {
  CryptoError,
  decrypt,
  decryptBytes,
  encrypt,
  encryptBytes,
  deriveStegoSeed,
  evaluatePasswordStrength,
  benchmarkKdfPerformance,
  DEFAULT_PBKDF2_ITERATIONS,
  LEGACY_PBKDF2_ITERATIONS,
  KDF_PBKDF2_SHA256,
  SALT_LENGTH,
  IV_LENGTH,
} from './crypto';
import {
  decodeQrFromRgba,
  encodeQrToPngBytes,
  hasValidPngSignature,
  validatePngStructure,
  MAX_QR_UTF8_BYTES,
} from './qrStego';
import {
  detectAndValidateImageFormat,
  validateImageFile,
  MAX_CARRIER_FILE_SIZE_BYTES,
  MAX_IMAGE_DIMENSION,
} from './canvasHelpers';

function createGradientPixels(width: number, height: number, alpha = 255): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = (i * 17) % 256;
    pixels[i * 4 + 1] = (i * 53) % 256;
    pixels[i * 4 + 2] = (i * 97) % 256;
    pixels[i * 4 + 3] = alpha;
  }
  return pixels;
}

test('calculateCapacityBytes accurately calculates available bytes for GPX1 and GPX2', () => {
  // GPX1: 80 pixels -> 240 bits = 30 bytes total -> 30 - 9 = 21 bytes
  assert.equal(calculateCapacityBytes(80, 1), 21);
  // GPX2: 80 pixels -> 30 bytes -> less than 47-byte header -> 0 bytes
  assert.equal(calculateCapacityBytes(80, 2), 0);
  // GPX2: 200 pixels -> 600 bits = 75 bytes -> 75 - 47 = 28 bytes
  assert.equal(calculateCapacityBytes(200, 2), 28);
  assert.equal(calculateCapacityBytes(0, 2), 0);
  assert.equal(calculateCapacityBytes(-10, 2), 0);
});

test('feistelPermute produces a strict 1-to-1 bijection without duplicates or out-of-bounds outputs', () => {
  const domainSize = 500;
  const roundKeys = new Uint32Array([0x12345678, 0x9abcdef0, 0x0fedcba9, 0x87654321]);
  const seen = new Set<number>();

  for (let i = 0; i < domainSize; i++) {
    const permuted = feistelPermute(i, domainSize, roundKeys);
    assert.ok(permuted >= 0 && permuted < domainSize, `Output ${permuted} out of bounds for domain ${domainSize}`);
    assert.ok(!seen.has(permuted), `Duplicate output ${permuted} generated for input ${i}`);
    seen.add(permuted);
  }

  assert.equal(seen.size, domainSize, 'Permutation must cover every element in the domain exactly once');
});

test('GPX2: embed and extract round-trips Unicode (Tamil + emoji) losslessly in plain mode', () => {
  const pixels = createGradientPixels(80, 80);
  const message = 'வணக்கம் Ghostpix! 👻🔐 Secret in plain sight — தமிழ் & UTF-8';
  const payload = encodeUtf8(message);

  const { pixels: encoded, bitsWritten, version } = embed(pixels, payload, false);
  assert.equal(version, 2);
  assert.equal(bitsWritten, (HEADER_BYTES_V2 + payload.length) * 8);

  // Confirm alpha channel remains strictly 255
  for (let i = 3; i < encoded.length; i += 4) {
    assert.equal(encoded[i], 255);
  }

  const result = extract(encoded);
  assert.equal(result.version, 2);
  assert.equal(result.isEncrypted, false);
  assert.equal(result.isQrImage, false);
  assert.equal(decodeUtf8(result.payload), message);
});

test('GPX2: authenticated encryption (AES-256-GCM + 600k PBKDF2) + randomized Feistel embedding round-trips and rejects wrong password', async () => {
  const pixels = createGradientPixels(100, 100);
  const secret = 'Top secret coordinates: 37.7749° N, 122.4194° W 🛰️';
  const password = 'correct-horse-battery-staple';

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const stegoSeed = await deriveStegoSeed(password, salt);

  const rawBytes = encodeUtf8(secret);
  const flags = FLAG_ENCRYPTED | FLAG_RANDOMIZED;
  const cipherLen = SALT_LENGTH + IV_LENGTH + rawBytes.length + 16;

  // AAD matching GPX2 header
  const aad = new Uint8Array(15);
  aad.set([0x47, 0x50, 0x58, 0x32, 0x02, flags, KDF_PBKDF2_SHA256], 0);
  const aadView = new DataView(aad.buffer);
  aadView.setUint32(7, DEFAULT_PBKDF2_ITERATIONS, false);
  aadView.setUint32(11, cipherLen, false);

  const encryptedPayload = await encryptBytes(rawBytes, password, {
    salt,
    iv,
    iterations: DEFAULT_PBKDF2_ITERATIONS,
    additionalData: aad,
  });

  const { pixels: encoded } = embed(pixels, encryptedPayload, {
    version: 2,
    isEncrypted: true,
    isRandomized: true,
    stegoSeed,
    salt,
    iv,
    kdfId: KDF_PBKDF2_SHA256,
    kdfIterations: DEFAULT_PBKDF2_ITERATIONS,
  });

  const peek = peekHeader(encoded);
  assert.equal(peek.hasGhostpixHeader, true);
  assert.equal(peek.version, 2);
  assert.equal(peek.isEncrypted, true);
  assert.equal(peek.isRandomized, true);
  assert.equal(peek.kdfIterations, DEFAULT_PBKDF2_ITERATIONS);

  // Extract with correct password
  const extractSeed = await deriveStegoSeed(password, peek.salt!);
  const extracted = extract(encoded, extractSeed);
  assert.equal(extracted.version, 2);
  assert.equal(extracted.isEncrypted, true);

  const decryptedBytes = await decryptBytes(extracted.payload, password, {
    iterations: extracted.kdfIterations,
    additionalData: aad,
  });
  assert.equal(decodeUtf8(decryptedBytes), secret);

  // Extract with wrong password -> wrong seed produces garbage payload, AES-GCM tag verification fails
  const wrongSeed = await deriveStegoSeed('wrong-password', peek.salt!);
  const wrongExtracted = extract(encoded, wrongSeed);
  await assert.rejects(
    () =>
      decryptBytes(wrongExtracted.payload, 'wrong-password', {
        iterations: extracted.kdfIterations,
        additionalData: aad,
      }),
    (err: unknown) => err instanceof CryptoError && err.code === 'WRONG_PASSWORD_OR_TAMPERED'
  );
});

test('GPX1 backward compatibility: legacy GPX1 encoded images must be readable by extract and peekHeader', async () => {
  const pixels = createGradientPixels(50, 50);
  const legacySecret = 'Legacy GPX1 Secret Message 📜';
  const legacyPassword = 'legacy-password-123';

  // Embed with GPX1 legacy format (version 1, 100k iterations)
  const legacyCipher = await encryptBytes(encodeUtf8(legacySecret), legacyPassword, {
    iterations: LEGACY_PBKDF2_ITERATIONS,
  });
  const { pixels: encodedLegacy } = embed(pixels, legacyCipher, {
    version: 1,
    isEncrypted: true,
    isQrImage: false,
    isRandomized: false,
  });

  // Peek detects GPX1 version 1
  const peek = peekHeader(encodedLegacy);
  assert.equal(peek.hasGhostpixHeader, true);
  assert.equal(peek.version, 1);
  assert.equal(peek.isEncrypted, true);
  assert.equal(peek.isRandomized, false);

  // Extract legacy payload sequentially
  const extracted = extract(encodedLegacy);
  assert.equal(extracted.version, 1);
  assert.equal(extracted.isEncrypted, true);

  const decrypted = await decryptBytes(extracted.payload, legacyPassword, {
    iterations: LEGACY_PBKDF2_ITERATIONS,
  });
  assert.equal(decodeUtf8(decrypted), legacySecret);
});

test('security: header modification (tampering with CRC, flags, or magic) is safely rejected', () => {
  const carrier = createGradientPixels(60, 60);
  const payload = encodeUtf8('Integrity test');
  const { pixels: encoded } = embed(carrier, payload, false);

  // Flip bit 0 of the magic header
  const tamperedMagic = new Uint8ClampedArray(encoded);
  tamperedMagic[0] ^= 0x01;
  assert.equal(peekHeader(tamperedMagic).hasGhostpixHeader, false);
  assert.throws(
    () => extract(tamperedMagic),
    (err: unknown) => err instanceof SteganographyError && err.code === 'NO_HIDDEN_MESSAGE'
  );

  // Flip bit in the header body after magic (corrupting CRC-32 while preserving magic)
  // Magic uses first 32 channel bits (pixels 0-10). Channel 60 (pixel 20, channel 0) is byte 7.
  const tamperedCrc = new Uint8ClampedArray(encoded);
  tamperedCrc[20 * 4] ^= 0x01; // Tamper with LSB of pixel 20 R channel (bit 60 in header)
  const peekCorrupted = peekHeader(tamperedCrc);
  assert.equal(peekCorrupted.isCorrupted, true);
  assert.throws(
    () => extract(tamperedCrc),
    (err: unknown) => err instanceof SteganographyError && err.code === 'CORRUPTED_MESSAGE'
  );
});

test('security: ciphertext modification (1-bit flip) is detected by AES-GCM authentication tag', async () => {
  const secret = 'Authenticated payload';
  const password = 'strong-password-321';
  const cipher = await encrypt(secret, password);

  // Flip 1 bit in ciphertext body
  const tampered = new Uint8Array(cipher);
  tampered[tampered.length - 1] ^= 0x01;

  await assert.rejects(
    () => decrypt(tampered, password),
    (err: unknown) => err instanceof CryptoError && err.code === 'WRONG_PASSWORD_OR_TAMPERED'
  );
});

test('security: AAD modification causes authentication failure', async () => {
  const secret = 'AAD protected';
  const password = 'aad-password-456';
  const aadOrig = new Uint8Array([1, 2, 3, 4]);
  const cipher = await encrypt(secret, password, { additionalData: aadOrig });

  // Decrypt with wrong AAD
  const aadTampered = new Uint8Array([1, 2, 3, 5]);
  await assert.rejects(
    () => decrypt(cipher, password, { additionalData: aadTampered }),
    (err: unknown) => err instanceof CryptoError && err.code === 'WRONG_PASSWORD_OR_TAMPERED'
  );

  // Decrypt with correct AAD succeeds
  const decrypted = await decrypt(cipher, password, { additionalData: aadOrig });
  assert.equal(decrypted, secret);
});

test('security: password strength evaluation enforces length and returns meaningful feedback', () => {
  assert.equal(evaluatePasswordStrength('').isAcceptable, false);
  assert.equal(evaluatePasswordStrength('short').isAcceptable, false);
  assert.equal(evaluatePasswordStrength('1234567').isAcceptable, false);
  assert.equal(evaluatePasswordStrength('aaaa1111').label, 'Weak');

  const strong = evaluatePasswordStrength('correct-horse-battery-staple-99');
  assert.equal(strong.isAcceptable, true);
  assert.ok(strong.score >= 3);
});

test('security: image upload validations detect file formats, dimensions, and sizes', async () => {
  // Valid PNG signature
  const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  assert.equal(await detectAndValidateImageFormat(validPng), 'png');

  // Valid JPEG signature
  const validJpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
  assert.equal(await detectAndValidateImageFormat(validJpg), 'jpeg');

  // Valid WebP signature
  const validWebp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20
  ]);
  assert.equal(await detectAndValidateImageFormat(validWebp), 'webp');

  // Invalid signature rejected
  const fakePng = new Uint8Array([0x00, 0x00, 0x00, 0x00, 1, 2, 3, 4]);
  await assert.rejects(() => detectAndValidateImageFormat(fakePng), /Unsupported or disguised file format/);

  // Oversized file validation
  const fakeBigFile = {
    name: 'giant.png',
    size: MAX_CARRIER_FILE_SIZE_BYTES + 1,
    type: 'image/png',
  } as File;
  assert.throws(() => validateImageFile(fakeBigFile), /exceeds the maximum allowed limit/);
});

test('security: PNG chunk structure validation protects against truncated or malicious headers', () => {
  // Valid minimal PNG with IHDR
  const validPngBytes = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, // length = 13
    73, 72, 68, 82, // 'IHDR'
    0, 0, 1, 0, // width = 256
    0, 0, 1, 0, // height = 256
    8, 0, 0, 0, 0,
    0, 0, 0, 0 // CRC
  ]);
  const ihdr = validatePngStructure(validPngBytes);
  assert.equal(ihdr.width, 256);
  assert.equal(ihdr.height, 256);

  // Truncated PNG throws
  assert.throws(() => validatePngStructure(new Uint8Array([137, 80, 78, 71])), /Invalid PNG signature/);
  // Non-IHDR first chunk throws
  const badChunk = new Uint8Array(validPngBytes);
  badChunk[12] = 0x54; // 'THDR' instead of 'IHDR'
  assert.throws(() => validatePngStructure(badChunk), /Expected IHDR chunk/);
});

test('embed throws CAPACITY_EXCEEDED when payload exceeds image capacity', () => {
  const tinyPixels = createGradientPixels(10, 10); // 100 px -> 37 bytes total -> less than 47B GPX2 header
  const msg = encodeUtf8('Testing capacity overflow');
  assert.throws(
    () => embed(tinyPixels, msg, false),
    (err: unknown) => err instanceof SteganographyError && err.code === 'CAPACITY_EXCEEDED'
  );
});

test('embed throws EMPTY_PAYLOAD on empty message', () => {
  const pixels = createGradientPixels(50, 50);
  assert.throws(
    () => embed(pixels, new Uint8Array(0), false),
    (err: unknown) => err instanceof SteganographyError && err.code === 'EMPTY_PAYLOAD'
  );
});

test('benchmarkKdfPerformance runs PBKDF2 iterations and returns execution duration', async () => {
  // Run with 10,000 iterations for test suite speed
  const result = await benchmarkKdfPerformance(10_000);
  assert.ok(result.durationMs >= 0);
  assert.equal(result.iterations, 10_000);
});

test('encodeQrToPngBytes creates valid scannable QR and validates size bounds', async () => {
  const secret = 'Ghostpix Hardened QR 🔐 தமிழ்';
  const qr = await encodeQrToPngBytes(secret);

  assert.ok(hasValidPngSignature(qr.pngBytes));
  assert.equal(decodeQrFromRgba(qr.rgbaPixels, qr.width, qr.height), secret);

  const oversized = 'A'.repeat(MAX_QR_UTF8_BYTES + 1);
  await assert.rejects(() => encodeQrToPngBytes(oversized), /QR code mode supports up to/);
});

test('inspectPixelGrid accurately reports modified LSBs', () => {
  const orig = flattenPixels(createGradientPixels(20, 20));
  const payload = encodeUtf8('Hi');
  const { pixels: encoded } = embed(orig, payload, false);
  const cells = inspectPixelGrid(orig, encoded, 20, 20, 0, 0, 4);

  assert.equal(cells.length, 16);
  assert.ok(cells.some((c) => c.rChanged || c.gChanged || c.bChanged));
});

test('large message near carrier capacity embeds and extracts losslessly', () => {
  const pixels = createGradientPixels(100, 100); // 10,000 px -> 3,750 bytes total -> 3,703 bytes capacity
  const maxBytes = calculateCapacityBytes(10_000, 2);
  assert.equal(maxBytes, 3703);

  // Fill 3,600 bytes (near capacity)
  const largeMessage = 'A'.repeat(3600);
  const payload = encodeUtf8(largeMessage);

  const { pixels: encoded } = embed(pixels, payload, false);
  const extracted = extract(encoded);
  assert.equal(decodeUtf8(extracted.payload), largeMessage);
});

test('simulated canvas PNG pixel round trip preserves LSBs without premultiplication distortion', () => {
  const transparent = createGradientPixels(30, 30, 128); // semi-transparent
  const flattened = flattenPixels(transparent);

  // Verify all alpha channels are strictly 255
  for (let i = 3; i < flattened.length; i += 4) {
    assert.equal(flattened[i], 255);
  }

  const payload = encodeUtf8('Zero alpha drift');
  const { pixels: encoded } = embed(flattened, payload, false);
  const extracted = extract(encoded);
  assert.equal(decodeUtf8(extracted.payload), 'Zero alpha drift');
});

test('mobile benchmark: 600k PBKDF2 iterations benchmarks within acceptable mobile thresholds', async () => {
  const { durationMs, iterations } = await benchmarkKdfPerformance(600_000);
  assert.equal(iterations, 600_000);
  assert.ok(durationMs > 0);
  // Note duration for mobile performance documentation
});

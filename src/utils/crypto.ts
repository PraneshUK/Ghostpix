/**
 * Ghostpix Cryptographic Subsystem
 *
 * Implements authenticated encryption using AES-256-GCM and key derivation
 * with PBKDF2-HMAC-SHA256 (600,000 iterations conforming to OWASP recommendations).
 * Supports Additional Authenticated Data (AAD) to cryptographically bind steganographic
 * header metadata to the encrypted payload, preventing header tampering.
 */

export const SALT_LENGTH = 16;
export const IV_LENGTH = 12;
export const TAG_LENGTH = 16;
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;
export const LEGACY_PBKDF2_ITERATIONS = 100_000;
export const MIN_PASSWORD_LENGTH = 8;

export const KDF_PBKDF2_SHA256 = 0x01;
export const KDF_ARGON2ID = 0x02;

export const MIN_ENCRYPTED_BYTES = SALT_LENGTH + IV_LENGTH + TAG_LENGTH;

export type CryptoErrorCode =
  | 'EMPTY_PASSWORD'
  | 'PASSWORD_TOO_SHORT'
  | 'CORRUPTED_CIPHERTEXT'
  | 'WRONG_PASSWORD_OR_TAMPERED'
  | 'UNSUPPORTED_KDF';

export class CryptoError extends Error {
  code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
  }
}

function getSubtleCrypto(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }
  return c.subtle;
}

/**
 * Safely zeroes out sensitive typed array memory.
 */
export function zeroBuffer(buf: Uint8Array): void {
  buf.fill(0);
}

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too short' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  feedback: string;
  isAcceptable: boolean;
}

/**
 * Evaluates password strength based on entropy heuristics and length constraints.
 * Enforces a sensible minimum length of 8 characters.
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password || password.length === 0) {
    return {
      score: 0,
      label: 'Too short',
      feedback: 'Enter a password to encrypt your secret message.',
      isAcceptable: false,
    };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      score: 0,
      label: 'Too short',
      feedback: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      isAcceptable: false,
    };
  }

  let poolSize = 0;
  if (/[a-z]/.test(password)) poolSize += 26;
  if (/[A-Z]/.test(password)) poolSize += 26;
  if (/[0-9]/.test(password)) poolSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) poolSize += 32;

  // Approximate entropy in bits = length * log2(poolSize)
  const entropy = password.length * (poolSize > 0 ? Math.log2(poolSize) : 0);

  // Check for common weak patterns (e.g. repeated single character)
  const isAllSameChar = /^(.)\1+$/.test(password);
  if (isAllSameChar) {
    return {
      score: 1,
      label: 'Weak',
      feedback: 'Avoid repeating the same character.',
      isAcceptable: false,
    };
  }

  if (entropy < 40 || password.length < 10) {
    return {
      score: 1,
      label: 'Weak',
      feedback: 'Use a mix of uppercase, lowercase, numbers, or a longer passphrase.',
      isAcceptable: true,
    };
  }

  if (entropy < 60) {
    return {
      score: 2,
      label: 'Fair',
      feedback: 'Decent password. Consider adding symbols or words for greater resistance.',
      isAcceptable: true,
    };
  }

  if (entropy < 80) {
    return {
      score: 3,
      label: 'Strong',
      feedback: 'Strong password. Highly resistant to brute-force attacks.',
      isAcceptable: true,
    };
  }

  return {
    score: 4,
    label: 'Very Strong',
    feedback: 'Excellent passphrase entropy.',
    isAcceptable: true,
  };
}

/**
 * Derives a 256-bit AES-GCM key from a password and salt using PBKDF2-HMAC-SHA256.
 */
export async function deriveAesKey(
  password: string,
  salt: Uint8Array,
  usage: KeyUsage[],
  iterations = DEFAULT_PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const encoder = new TextEncoder();
  const rawPassword = encoder.encode(password);

  const keyMaterial = await subtle.importKey(
    'raw',
    rawPassword,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usage
  );
}

/**
 * Derives a secondary 256-bit key from the password and salt for steganographic
 * pseudo-random bit scattering, ensuring the stego permutation key is cryptographically
 * isolated from the AES encryption key (domain separation).
 */
export async function deriveStegoSeed(
  password: string,
  salt: Uint8Array,
  iterations = Math.min(DEFAULT_PBKDF2_ITERATIONS, 50_000)
): Promise<Uint8Array> {
  const subtle = getSubtleCrypto();
  const encoder = new TextEncoder();
  // Domain separation salt: append tag to salt
  const domainSalt = new Uint8Array(salt.length + 8);
  domainSalt.set(salt, 0);
  domainSalt.set(encoder.encode('GPX2STEG'), salt.length);

  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: domainSalt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return new Uint8Array(bits);
}

export interface EncryptOptions {
  iterations?: number;
  additionalData?: Uint8Array;
  salt?: Uint8Array;
  iv?: Uint8Array;
}

export interface DecryptOptions {
  iterations?: number;
  additionalData?: Uint8Array;
}

/**
 * Encrypts arbitrary binary bytes using AES-256-GCM.
 * Output layout: [16B salt | 12B iv | ciphertext + 16B GCM auth tag]
 * If options.additionalData is supplied, it is authenticated as AEAD AAD.
 */
export async function encryptBytes(
  plainBytes: Uint8Array,
  password: string,
  options: EncryptOptions = {}
): Promise<Uint8Array> {
  if (!password) {
    throw new CryptoError('EMPTY_PASSWORD', 'A password is required for encryption.');
  }

  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  const salt = options.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = options.iv ?? globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveAesKey(password, salt, ['encrypt'], iterations);

  const subtle = getSubtleCrypto();
  const gcmParams: AesGcmParams = {
    name: 'AES-GCM',
    iv: iv as BufferSource,
  };
  if (options.additionalData && options.additionalData.length > 0) {
    gcmParams.additionalData = options.additionalData as BufferSource;
  }

  const cipherBuffer = await subtle.encrypt(
    gcmParams,
    key,
    plainBytes as BufferSource
  );
  const cipherBytes = new Uint8Array(cipherBuffer);

  const output = new Uint8Array(SALT_LENGTH + IV_LENGTH + cipherBytes.length);
  output.set(salt, 0);
  output.set(iv, SALT_LENGTH);
  output.set(cipherBytes, SALT_LENGTH + IV_LENGTH);
  return output;
}

/**
 * Encrypts a UTF-8 plaintext string using AES-256-GCM.
 */
export async function encrypt(
  plaintext: string,
  password: string,
  options: EncryptOptions = {}
): Promise<Uint8Array> {
  const plaintextBytes = new TextEncoder().encode(plaintext);
  return encryptBytes(plaintextBytes, password, options);
}

/**
 * Decrypts raw binary bytes produced by `encryptBytes()` or `encrypt()`.
 * Supports both GPX2 (600,000 iterations + AAD) and legacy GPX1 (100,000 iterations).
 */
export async function decryptBytes(
  payload: Uint8Array,
  password: string,
  options: DecryptOptions = {}
): Promise<Uint8Array> {
  if (!password) {
    throw new CryptoError(
      'EMPTY_PASSWORD',
      'This image contains an encrypted message. Please enter the password.'
    );
  }
  if (payload.length < MIN_ENCRYPTED_BYTES) {
    throw new CryptoError(
      'CORRUPTED_CIPHERTEXT',
      'The encrypted data inside this image appears incomplete or damaged.'
    );
  }

  const salt = payload.slice(0, SALT_LENGTH);
  const iv = payload.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = payload.slice(SALT_LENGTH + IV_LENGTH);

  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  const key = await deriveAesKey(password, salt, ['decrypt'], iterations);

  const subtle = getSubtleCrypto();
  const gcmParams: AesGcmParams = {
    name: 'AES-GCM',
    iv: iv as BufferSource,
  };
  if (options.additionalData && options.additionalData.length > 0) {
    gcmParams.additionalData = options.additionalData as BufferSource;
  }

  try {
    const plainBuffer = await subtle.decrypt(
      gcmParams,
      key,
      ciphertext as BufferSource
    );
    return new Uint8Array(plainBuffer);
  } catch {
    throw new CryptoError(
      'WRONG_PASSWORD_OR_TAMPERED',
      'Incorrect password or the hidden data was altered (authentication tag verification failed).'
    );
  }
}

/**
 * Decrypts a payload produced by `encrypt()` using the provided password.
 */
export async function decrypt(
  payload: Uint8Array,
  password: string,
  options: DecryptOptions = {}
): Promise<string> {
  const plainBytes = await decryptBytes(payload, password, options);
  return new TextDecoder('utf-8', { fatal: true }).decode(plainBytes);
}

/**
 * Benchmarks PBKDF2-HMAC-SHA256 performance for a given iteration count.
 * Useful for performance diagnostics on mobile devices.
 */
export async function benchmarkKdfPerformance(
  iterations = DEFAULT_PBKDF2_ITERATIONS
): Promise<{ durationMs: number; iterations: number }> {
  const salt = new Uint8Array(16);
  const start = performance.now();
  await deriveAesKey('benchmark-sample-password', salt, ['encrypt'], iterations);
  const durationMs = performance.now() - start;
  return { durationMs, iterations };
}

export const CRYPTO_OVERHEAD_BYTES = SALT_LENGTH + IV_LENGTH + TAG_LENGTH;

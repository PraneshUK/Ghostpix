# Ghostpix — Secure Client-Side Image Steganography

Ghostpix is a 100% browser-based application security tool that embeds and extracts secret data (Unicode text, Tamil, emojis, and QR code PNG layers) within ordinary photos using authenticated cryptography (AES-256-GCM + PBKDF2-HMAC-SHA256) and randomized LSB steganography.

All processing occurs strictly inside the user's browser using the native Web Crypto and Canvas 2D APIs. No images, passwords, or plaintexts are ever transmitted over the network or stored in persistent browser storage (`localStorage` / `sessionStorage`).

---

## Security Architecture & Remediation

### 1. Steganography Format (GPX2)

Ghostpix implements the hardened **GPX2** steganographic container format while maintaining backward compatibility with legacy **GPX1** images:

| Specification | GPX1 (Legacy) | GPX2 (Current) |
|---|---|---|
| **Magic Signature** | `GPX1` (`0x47, 0x50, 0x58, 0x31`) | `GPX2` (`0x47, 0x50, 0x58, 0x32`) |
| **Header Size** | 9 bytes | 47 bytes |
| **Header Integrity** | None | CRC-32 checksum (verifies header before KDF) |
| **Bit Distribution** | Sequential LSB from pixel 0 | Pseudo-random Feistel permutation keyed by password seed |
| **Memory Overhead** | $O(N)$ linear index | $O(1)$ constant memory via cycle-walking Feistel cipher |
| **KDF Algorithm** | PBKDF2-HMAC-SHA256 (100k) | PBKDF2-HMAC-SHA256 (600,000 iterations default) |
| **Tamper Protection** | Ciphertext-only GCM tag | AES-256-GCM with Additional Authenticated Data (AAD) |

#### Steganography Limitations Notice
> **Important**: Randomized LSB embedding scatters modified bits across carrier channels to eliminate localized sequential step-changes in LSB entropy. However, LSB modification alters the carrier image's global bit distribution and remains detectable by advanced statistical steganalysis (such as Sample Pair Analysis, RS steganalysis, or Chi-squared testing). Ghostpix does not claim mathematical undetectability against statistical steganalysis.

---

### 2. Cryptographic Controls

- **Cipher**: AES-256-GCM authenticated encryption with 128-bit authentication tags.
- **Key Derivation (KDF)**: PBKDF2-HMAC-SHA256 at **600,000 iterations** (conforming to OWASP recommendations).
- **Argon2id Evaluation**: Evaluated for browser client-side execution. While Argon2id provides memory-hardness against GPU cracking, pure-browser execution requires WebAssembly (`hash-wasm`), which increases bundle size, requires `'wasm-unsafe-eval'` in CSP, and can trigger Out-Of-Memory crashes on mobile devices. Ghostpix architectures KDF identification into the GPX2 header (`0x01` = PBKDF2-SHA256, `0x02` = Argon2id reserved) and utilizes native WebCrypto hardware acceleration for 600k PBKDF2 iterations.
- **Additional Authenticated Data (AAD)**: The GPX2 header metadata (magic, version, flags, KDF ID, iterations, and payload length) is cryptographically bound to the AES-GCM ciphertext. Any modification of header parameters causes authentication failure.
- **Salts & Nonces**: Cryptographically secure 16-byte random salt (`crypto.getRandomValues`) and 12-byte random IV are generated uniquely for every encryption.
- **Password Enforcement**: Minimum length of 8 characters enforced with real-time heuristic entropy feedback and mandatory password confirmation.
- **Memory Hygiene**: Transient React component state only; sensitive password states are zeroed/cleared on unmount or workflow reset.

---

### 3. Image Upload & Canvas Hardening

- **Format Verification**: Magic number byte validation for PNG (`89 50 4E 47 0D 0A 1A 0A`), JPEG (`FF D8 FF`), and WebP (`RIFF...WEBP`). File extensions and MIME headers are never trusted blindly.
- **Resource Caps**: 50 MB maximum carrier file size limit; 10 MB maximum QR file limit; 16,384px maximum dimension cap; 24 MP maximum canvas pixel cap.
- **QR Re-Encoding**: All uploaded JPEG and WebP QR images are re-rendered and encoded into lossless 8-bit grayscale PNGs prior to embedding, preventing lossy JPEG compression artifacts from corrupting QR scanlines.
- **Memory Management**: Premultiplied alpha flattening prevents canvas export bit drift; all created object URLs are systematically tracked and revoked.

---

### 4. Content Security Policy (CSP)

Ghostpix enforces a strict Content Security Policy restricting network activity:
```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self';
```

---

## Development & Testing

### Prerequisites
- Node.js (v18+)
- npm

### Installation
```bash
npm install
```

### Run Automated Tests
```bash
npm test
```

### Type Checking & Linting
```bash
npm run lint
```

### Production Build
```bash
npm run build
```

### Run Local Development Server
```bash
npm run dev
```

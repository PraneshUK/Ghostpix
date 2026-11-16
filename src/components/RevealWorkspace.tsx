import React, { useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Lock,
  QrCode,
  ShieldCheck,
  ShieldQuestion,
  Unlock,
  Upload,
  FileCheck2,
} from 'lucide-react';
import { DropZone } from './DropZone';
import { ScrambleRevealText } from './ScrambleRevealText';
import { LiquidGlassPanel } from './LiquidGlassPanel';
import { LoadedImage, loadImageFromFile } from '../utils/canvasHelpers';
import {
  DEFAULT_PBKDF2_ITERATIONS,
  KDF_PBKDF2_SHA256,
  LEGACY_PBKDF2_ITERATIONS,
  decrypt,
  decryptBytes,
  deriveStegoSeed,
} from '../utils/crypto';
import {
  FLAG_ENCRYPTED,
  FLAG_QR_IMAGE,
  FLAG_RANDOMIZED,
  HeaderPeekResult,
  decodeUtf8,
  extract,
  peekHeader,
} from '../utils/steganography';
import { decodeQrPngBytesInBrowser, decodeQrImageFile } from '../utils/qrStego';
import { SecurityAuditPanel, SecurityAuditStatus } from './SecurityAuditPanel';

interface RevealResult {
  message: string;
  wasEncrypted: boolean;
  wasQrImage: boolean;
  qrImageUrl?: string;
  payloadBytes: number;
  revealKey: number;
}

interface StandaloneQrResult {
  text: string;
  previewUrl: string;
  revealKey: number;
}

interface RevealWorkspaceProps {
  pendingFile: File | null;
  onPendingFileConsumed: () => void;
}

export const RevealWorkspace: React.FC<RevealWorkspaceProps> = ({
  pendingFile,
  onPendingFileConsumed,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const passwordId = useId();

  const [revealMode, setRevealMode] = useState<'carrier' | 'standaloneQr'>('carrier');

  // Carrier PNG state
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [headerPeek, setHeaderPeek] = useState<HeaderPeekResult | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isRevealing, setIsRevealing] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [result, setResult] = useState<RevealResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Security diagnostics state
  const [auditStatus, setAuditStatus] = useState<SecurityAuditStatus | undefined>(undefined);
  const [authError, setAuthError] = useState<string | null>(null);

  // Standalone QR Decode state
  const [standaloneResult, setStandaloneResult] = useState<StandaloneQrResult | null>(null);
  const [standaloneLoading, setStandaloneLoading] = useState(false);
  const [standaloneError, setStandaloneError] = useState<string | null>(null);
  const [standaloneCopied, setStandaloneCopied] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const resultCardRef = useRef<HTMLDivElement | null>(null);
  const standaloneResultRef = useRef<HTMLDivElement | null>(null);
  const latestLoadRequestId = useRef(0);

  // Wipe sensitive password state on unmount
  useEffect(() => {
    return () => {
      setPassword('');
    };
  }, []);

  useEffect(() => {
    return () => {
      if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
    };
  }, [image]);

  useEffect(() => {
    return () => {
      if (result?.qrImageUrl) URL.revokeObjectURL(result.qrImageUrl);
    };
  }, [result]);

  useEffect(() => {
    return () => {
      if (standaloneResult?.previewUrl) URL.revokeObjectURL(standaloneResult.previewUrl);
    };
  }, [standaloneResult]);

  useEffect(() => {
    if (result?.revealKey && resultCardRef.current) {
      resultCardRef.current.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
      });
    }
  }, [result?.revealKey, prefersReducedMotion]);

  useEffect(() => {
    if (standaloneResult?.revealKey && standaloneResultRef.current) {
      standaloneResultRef.current.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
      });
    }
  }, [standaloneResult?.revealKey, prefersReducedMotion]);

  const handleFileSelected = async (file: File) => {
    const requestId = ++latestLoadRequestId.current;
    setImageError(null);
    setRevealError(null);
    setResult(null);
    setHeaderPeek(null);
    setAuditStatus(undefined);
    setAuthError(null);
    setImageLoading(true);

    try {
      const loaded = await loadImageFromFile(file);
      if (latestLoadRequestId.current !== requestId) {
        if (loaded.previewUrl) URL.revokeObjectURL(loaded.previewUrl);
        return;
      }

      const peek = peekHeader(loaded.originalPixels);
      setImage((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return loaded;
      });
      setHeaderPeek(peek);

      if (peek.isCorrupted) {
        setAuditStatus('CORRUPTED');
      } else if (!peek.hasGhostpixHeader) {
        setAuditStatus('NO_MESSAGE');
      } else if (peek.isEncrypted) {
        setAuditStatus('ENCRYPTED_UNVERIFIED');
        requestAnimationFrame(() => {
          passwordInputRef.current?.focus();
        });
      } else {
        setAuditStatus('PLAINTEXT');
      }
    } catch (err) {
      if (latestLoadRequestId.current === requestId) {
        setImageError(err instanceof Error ? err.message : 'Unable to load image.');
      }
    } finally {
      if (latestLoadRequestId.current === requestId) {
        setImageLoading(false);
      }
    }
  };

  useEffect(() => {
    if (pendingFile) {
      void handleFileSelected(pendingFile);
      onPendingFileConsumed();
    }
  }, [pendingFile, onPendingFileConsumed]);

  const handleClear = () => {
    setImage((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setHeaderPeek(null);
    setImageError(null);
    setRevealError(null);
    setResult(null);
    setAuditStatus(undefined);
    setAuthError(null);
    setPassword('');
  };

  const handleRevealMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRevealing) return; // Prevent duplicate rapid clicks
    setRevealError(null);
    setCopied(false);

    if (!image) {
      setRevealError('Please upload or drop the received PNG image first.');
      return;
    }

    const peek = peekHeader(image.originalPixels);
    if (!peek.hasGhostpixHeader) {
      setAuditStatus('NO_MESSAGE');
      setRevealError(
        'No hidden Ghostpix header was found in this image. Make sure it was sent uncompressed as a File or Document.'
      );
      return;
    }

    setIsRevealing(true);
    try {
      const scanDurationMs = prefersReducedMotion ? 0 : 750;
      const delayPromise = new Promise((resolve) => setTimeout(resolve, scanDurationMs));

      let decodedMessage = '';
      let qrImageUrl: string | undefined;
      let rawBytes: Uint8Array;
      const isEncrypted = peek.isEncrypted;
      const isQr = peek.isQrImage;

      if (peek.version === 2) {
        // GPX2 format
        let stegoSeed: Uint8Array | undefined;
        if (peek.isEncrypted) {
          if (!password) {
            throw new Error('This image contains an encrypted message. Please enter the password.');
          }
          stegoSeed = await deriveStegoSeed(password, peek.salt!);
        }

        const extracted = extract(image.originalPixels, stegoSeed);

        if (extracted.isEncrypted) {
          // Reconstruct AAD for AES-GCM tag verification
          const flags =
            FLAG_ENCRYPTED |
            (extracted.isQrImage ? FLAG_QR_IMAGE : 0) |
            (extracted.isRandomized ? FLAG_RANDOMIZED : 0);
          const aad = new Uint8Array(15);
          aad.set([0x47, 0x50, 0x58, 0x32, 0x02, flags, extracted.kdfId ?? KDF_PBKDF2_SHA256], 0);
          const aadView = new DataView(aad.buffer);
          aadView.setUint32(7, extracted.kdfIterations ?? DEFAULT_PBKDF2_ITERATIONS, false);
          aadView.setUint32(11, extracted.payloadBytes, false);

          rawBytes = await decryptBytes(extracted.payload, password, {
            iterations: extracted.kdfIterations,
            additionalData: aad,
          });
        } else {
          rawBytes = extracted.payload;
        }
      } else {
        // GPX1 legacy format
        const extracted = extract(image.originalPixels);
        if (extracted.isEncrypted) {
          if (!password) {
            throw new Error('This image contains an encrypted GPX1 message. Please enter the password.');
          }
          rawBytes = await decryptBytes(extracted.payload, password, {
            iterations: LEGACY_PBKDF2_ITERATIONS,
          });
        } else {
          rawBytes = extracted.payload;
        }
      }

      if (isQr) {
        qrImageUrl = URL.createObjectURL(new Blob([rawBytes as BlobPart], { type: 'image/png' }));
        try {
          decodedMessage = await decodeQrPngBytesInBrowser(rawBytes);
        } catch {
          if (qrImageUrl) URL.revokeObjectURL(qrImageUrl);
          throw new Error('Extracted QR payload is not a valid PNG image or could not be decoded.');
        }
      } else {
        try {
          decodedMessage = decodeUtf8(rawBytes);
        } catch {
          throw new Error('Extracted text payload is corrupted or contains invalid UTF-8 bytes.');
        }
      }

      await delayPromise;

      setResult({
        message: decodedMessage,
        wasEncrypted: isEncrypted,
        wasQrImage: isQr,
        qrImageUrl,
        payloadBytes: peek.payloadBytes,
        revealKey: Date.now(),
      });
      setAuditStatus(isEncrypted ? 'AUTHENTICATED' : 'PLAINTEXT');
      setAuthError(null);
    } catch (err) {
      setResult(null);
      const msg = err instanceof Error ? err.message : 'Could not extract a hidden message from this image.';
      setRevealError(msg);
      setAuthError(msg);
      setAuditStatus(peek?.isEncrypted ? 'AUTH_FAILED' : 'CORRUPTED');
    } finally {
      setIsRevealing(false);
    }
  };

  const handleDownloadQr = () => {
    if (!result?.qrImageUrl) return;
    const anchor = document.createElement('a');
    anchor.href = result.qrImageUrl;
    anchor.download = 'extracted-secret-qr.png';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const handleCopy = async () => {
    if (!result) return;
    let copiedOk = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(result.message);
        copiedOk = true;
      } catch {
        copiedOk = false;
      }
    }
    if (!copiedOk) {
      try {
        const ta = document.createElement('textarea');
        ta.value = result.message;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copiedOk = document.execCommand('copy');
        ta.remove();
      } catch {
        copiedOk = false;
      }
    }
    if (copiedOk) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      setRevealError('Clipboard permission was blocked. You can still select and copy the text.');
    }
  };

  // Standalone QR decode handlers
  const handleStandaloneFileSelected = async (file: File) => {
    setStandaloneError(null);
    setStandaloneResult(null);
    setStandaloneLoading(true);
    try {
      const decoded = await decodeQrImageFile(file);
      setStandaloneResult({
        text: decoded.text,
        previewUrl: decoded.previewUrl,
        revealKey: Date.now(),
      });
    } catch (err) {
      setStandaloneError(
        err instanceof Error ? err.message : 'Could not decode QR code from this image.'
      );
    } finally {
      setStandaloneLoading(false);
    }
  };

  const handleStandaloneCopy = async () => {
    if (!standaloneResult) return;
    let copiedOk = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(standaloneResult.text);
        copiedOk = true;
      } catch {
        copiedOk = false;
      }
    }
    if (!copiedOk) {
      try {
        const ta = document.createElement('textarea');
        ta.value = standaloneResult.text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copiedOk = document.execCommand('copy');
        ta.remove();
      } catch {
        copiedOk = false;
      }
    }
    if (copiedOk) {
      setStandaloneCopied(true);
      window.setTimeout(() => setStandaloneCopied(false), 1800);
    } else {
      setStandaloneError('Clipboard permission was blocked.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <LiquidGlassPanel
        as="section"
        aria-labelledby="reveal-card-heading"
        className="p-5 sm:p-7 space-y-6"
      >
        <div className="flex items-baseline justify-between gap-3 border-b border-[#C5C5CC] dark:border-white/12 pb-4">
          <div className="space-y-1">
            <h2
              id="reveal-card-heading"
              className="font-display text-xl font-bold tracking-tight text-[#111114] dark:text-[#F4F4F6]"
            >
              Reveal Inspector & QR Decoder
            </h2>
            <p className="text-sm text-[#5A5A62] dark:text-[#A1A1AA]">
              Unlock steganographic carrier PNGs or decode standalone QR code images instantly.
            </p>
          </div>
          <span className="font-condensed text-3xl font-bold leading-none text-[#FF5A1F]">
            002
          </span>
        </div>

        {/* Mode Switch Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-[#F5F5F7] dark:bg-white/[0.04] border border-[#C5C5CC] dark:border-white/12">
          <button
            type="button"
            onClick={() => setRevealMode('carrier')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 font-mono-code text-xs font-semibold transition-colors ${
              revealMode === 'carrier'
                ? 'bg-[#111114] text-white dark:bg-white dark:text-[#111114]'
                : 'text-[#5A5A62] dark:text-[#A1A1AA] hover:text-[#111114] dark:hover:text-white'
            }`}
          >
            <Unlock className="h-4 w-4 shrink-0 text-[#FF5A1F]" aria-hidden="true" />
            <span>Unlock Carrier PNG</span>
          </button>
          <button
            type="button"
            onClick={() => setRevealMode('standaloneQr')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 font-mono-code text-xs font-semibold transition-colors ${
              revealMode === 'standaloneQr'
                ? 'bg-[#111114] text-white dark:bg-white dark:text-[#111114]'
                : 'text-[#5A5A62] dark:text-[#A1A1AA] hover:text-[#111114] dark:hover:text-white'
            }`}
          >
            <QrCode className="h-4 w-4 shrink-0 text-[#FF5A1F]" aria-hidden="true" />
            <span>Decode Standalone QR</span>
          </button>
        </div>

        {/* Collapsible Step-by-Step Guide */}
        <div className="border border-[#C5C5CC] dark:border-white/15 bg-white/75 dark:bg-white/[0.03]">
          <button
            type="button"
            aria-expanded={showGuide}
            onClick={() => setShowGuide((prev) => !prev)}
            className="flex w-full min-h-[42px] items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors hover:bg-[#F5F5F7] dark:hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-[#FF5A1F]"
          >
            <span className="inline-flex items-center gap-2 font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
              <HelpCircle className="h-4 w-4 shrink-0 text-[#FF5A1F]" aria-hidden="true" />
              <span>How to use Reveal Inspector (4 simple steps)</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-[#5A5A62] dark:text-[#A1A1AA] transition-transform duration-200 ${
                showGuide ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          {showGuide && (
            <ol className="grid gap-2.5 border-t border-[#C5C5CC] dark:border-white/12 p-3.5 sm:grid-cols-2 text-xs">
              <li className="space-y-0.5 border border-[#C5C5CC]/70 dark:border-white/10 bg-[#F5F5F7]/70 dark:bg-white/[0.02] p-2.5">
                <p className="font-mono-code font-semibold text-[#FF5A1F]">01 · Choose Mode</p>
                <p className="text-[#111114] dark:text-[#F4F4F6]">
                  Select Unlock Carrier PNG for hidden messages or Decode Standalone QR for regular QR codes.
                </p>
              </li>
              <li className="space-y-0.5 border border-[#C5C5CC]/70 dark:border-white/10 bg-[#F5F5F7]/70 dark:bg-white/[0.02] p-2.5">
                <p className="font-mono-code font-semibold text-[#FF5A1F]">02 · Drop the file</p>
                <p className="text-[#111114] dark:text-[#F4F4F6]">
                  Upload the PNG sent as an uncompressed File or Document.
                </p>
              </li>
              <li className="space-y-0.5 border border-[#C5C5CC]/70 dark:border-white/10 bg-[#F5F5F7]/70 dark:bg-white/[0.02] p-2.5">
                <p className="font-mono-code font-semibold text-[#FF5A1F]">03 · Password</p>
                <p className="text-[#111114] dark:text-[#F4F4F6]">
                  Enter the password if the sender protected the message with AES-GCM.
                </p>
              </li>
              <li className="space-y-0.5 border border-[#C5C5CC]/70 dark:border-white/10 bg-[#F5F5F7]/70 dark:bg-white/[0.02] p-2.5">
                <p className="font-mono-code font-semibold text-[#FF5A1F]">04 · Reveal & copy</p>
                <p className="text-[#111114] dark:text-[#F4F4F6]">
                  Click Reveal Message to authenticate, decrypt, and view the secret.
                </p>
              </li>
            </ol>
          )}
        </div>

        {revealMode === 'carrier' ? (
          <>
            <DropZone
              image={image}
              onFileSelected={handleFileSelected}
              onClear={handleClear}
              isLoading={imageLoading}
              isScanning={isRevealing}
              scanMode="reveal"
              error={imageError}
              acceptLabel="Lossless PNG recommended (JPEG recompression erases LSBs)"
              emptyTitle="Drop the received Ghostpix PNG here"
              emptySubtitle="or choose the PNG file from your device"
              showSamples={false}
            />

            {image && headerPeek && (
              <div
                data-testid="gpx1-prescan-banner"
                role="status"
                className={`flex items-start gap-2.5 border px-3.5 py-2.5 text-xs ${
                  headerPeek.hasGhostpixHeader
                    ? 'border-[#15803D]/35 dark:border-[#4ADE80]/35 bg-[#15803D]/[0.07] dark:bg-[#4ADE80]/[0.08] text-[#111114] dark:text-[#F4F4F6]'
                    : 'border-[#C5C5CC] dark:border-white/20 bg-white/70 dark:bg-white/[0.04] text-[#5A5A62] dark:text-[#A1A1AA]'
                }`}
              >
                {headerPeek.hasGhostpixHeader ? (
                  <ShieldCheck
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#15803D] dark:text-[#4ADE80]"
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldQuestion
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A1F]"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0">
                  {headerPeek.hasGhostpixHeader ? (
                    <p className="font-mono-code leading-relaxed">
                      <strong className="font-semibold text-[#15803D] dark:text-[#4ADE80]">
                        {headerPeek.version === 2 ? 'GPX2 Format Detected' : 'GPX1 Legacy Format Detected'}
                      </strong>{' '}
                      · {headerPeek.isQrImage ? 'QR Code PNG' : 'UTF-8 Text'} ·{' '}
                      {headerPeek.isEncrypted
                        ? 'AES-GCM Locked — enter password'
                        : 'Plaintext (no password required)'}{' '}
                      · {headerPeek.payloadBytes.toLocaleString()} B
                    </p>
                  ) : (
                    <p className="leading-relaxed">
                      No Ghostpix steganographic signature detected in the opening pixels.
                    </p>
                  )}
                </div>
              </div>
            )}

            {image?.isLossySource && (
              <div
                role="note"
                className="flex items-start gap-2.5 border border-[#FF5A1F] bg-[#FF5A1F]/10 px-3.5 py-2.5 text-xs font-medium text-[#B83206] dark:text-[#FF8254]"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A1F]" aria-hidden="true" />
                <span>
                  This looks like a JPEG file. Lossy JPEG compression destroys LSB bit patterns. Always ask the sender for the original PNG file.
                </span>
              </div>
            )}

            <SecurityAuditPanel
              image={image}
              headerPeek={headerPeek}
              auditStatus={auditStatus}
              authError={authError}
            />

            <form onSubmit={handleRevealMessage} className="space-y-4" noValidate>
              <div className="space-y-2">
                <label
                  htmlFor={passwordId}
                  className="block text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]"
                >
                  Decryption password{' '}
                  <span className="font-normal text-[#5A5A62] dark:text-[#A1A1AA]">
                    {headerPeek?.isEncrypted ? '(required to unlock)' : '(not required for plain messages)'}
                  </span>
                </label>
                <div className="relative">
                  <input
                    ref={passwordInputRef}
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (revealError) setRevealError(null);
                    }}
                    placeholder={
                      headerPeek?.isEncrypted
                        ? 'Enter password to authenticate and decrypt'
                        : 'Leave blank for unencrypted messages'
                    }
                    autoComplete="current-password"
                    className="liquid-glass-inset w-full min-h-[44px] py-2.5 pr-11 pl-4 text-sm font-mono-code text-[#111114] dark:text-[#F4F4F6] placeholder-[#5A5A62]/65 dark:placeholder-[#A1A1AA]/60 transition-colors focus:border-[#111114] dark:focus:border-white/45 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute top-1/2 right-2 -translate-y-1/2 flex h-9 w-9 items-center justify-center text-[#5A5A62] dark:text-[#A1A1AA] hover:text-[#111114] dark:hover:text-white focus-visible:outline-2 focus-visible:outline-[#FF5A1F]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={isRevealing || imageLoading}
                whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                className="chamfer-btn btn-kinetic-bevel btn-hover-glint group relative flex w-full min-h-[50px] items-center justify-between overflow-hidden bg-[#FF5A1F] px-5 py-3 font-mono-code text-sm font-semibold tracking-wide text-white transition-colors duration-200 hover:bg-[#111114] dark:hover:bg-[#F4F4F6] dark:hover:text-[#111114] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A1F]"
              >
                {isRevealing && !prefersReducedMotion && (
                  <span
                    aria-hidden="true"
                    className="btn-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                  />
                )}
                <span className="relative z-10 inline-flex items-center gap-2.5">
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                  <span>{isRevealing ? 'Extracting & verifying bits…' : 'Reveal Message'}</span>
                </span>
                <span
                  aria-hidden="true"
                  className="relative z-10 flex h-7 w-7 items-center justify-center bg-white/20 dark:bg-black/15"
                >
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </motion.button>
            </form>

            {revealError && (
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="flex items-start gap-3 border border-[#FF5A1F] bg-[#FF5A1F]/10 px-4 py-3.5 text-sm font-medium text-[#B83206] dark:text-[#FF8254]"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A1F]" aria-hidden="true" />
                <span>{revealError}</span>
              </motion.div>
            )}

            {result && (
              <motion.div
                ref={resultCardRef}
                key={result.revealKey}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                data-testid="revealed-message-card"
                className="scroll-mt-24 border border-[#111114] dark:border-white/30 bg-white dark:bg-[#0B0B0F] p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C5C5CC] dark:border-white/12 pb-3">
                  <div className="flex items-center gap-2 text-xs text-[#5A5A62] dark:text-[#A1A1AA]">
                    {result.wasQrImage ? (
                      <QrCode className="h-3.5 w-3.5 text-[#FF5A1F]" aria-hidden="true" />
                    ) : result.wasEncrypted ? (
                      <Lock className="h-3.5 w-3.5 text-[#FF5A1F]" aria-hidden="true" />
                    ) : (
                      <FileCheck2 className="h-3.5 w-3.5 text-[#15803D]" aria-hidden="true" />
                    )}
                    <span className="font-mono-code font-semibold text-[#111114] dark:text-[#F4F4F6]">
                      {result.wasQrImage
                        ? 'QR Code Image Payload'
                        : result.wasEncrypted
                          ? 'AES-256-GCM Authenticated'
                          : 'Plaintext UTF-8'}
                    </span>
                    <span>·</span>
                    <span className="font-mono-code">{result.payloadBytes.toLocaleString()} bytes</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {result.qrImageUrl && (
                      <button
                        type="button"
                        onClick={handleDownloadQr}
                        className="chamfer-btn-sm inline-flex min-h-[36px] items-center gap-1.5 border border-[#C5C5CC] dark:border-white/20 bg-[#F5F5F7] dark:bg-white/[0.04] px-3 py-1.5 font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6] transition-colors hover:border-[#FF5A1F]"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Save QR PNG</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleCopy}
                      className="chamfer-btn-sm inline-flex min-h-[36px] items-center gap-1.5 bg-[#FF5A1F] px-3.5 py-1.5 font-mono-code text-xs font-semibold text-white transition-colors hover:bg-[#111114] dark:hover:bg-[#F4F4F6] dark:hover:text-[#111114]"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Copy Message</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {result.qrImageUrl && (
                  <div className="flex items-center gap-4 border border-[#C5C5CC] dark:border-white/12 bg-[#F5F5F7] dark:bg-white/[0.02] p-3">
                    <img
                      src={result.qrImageUrl}
                      alt="Extracted scannable QR code"
                      style={{ imageRendering: 'pixelated' }}
                      className="h-20 w-20 border border-[#C5C5CC] dark:border-white/20 bg-white p-1"
                    />
                    <div className="space-y-1 text-xs">
                      <p className="font-mono-code font-semibold text-[#FF5A1F]">
                        Scannable QR Image Extracted
                      </p>
                      <p className="text-[#5A5A62] dark:text-[#A1A1AA]">
                        This high-contrast QR PNG was extracted losslessly from the carrier pixels.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="font-mono-code text-[11px] font-semibold uppercase tracking-wider text-[#5A5A62] dark:text-[#A1A1AA]">
                    Decoded Secret Message
                  </p>
                  <div className="liquid-glass-inset max-h-72 overflow-y-auto p-4">
                    <ScrambleRevealText
                      text={result.message}
                      className="font-mono-code text-sm sm:text-base leading-relaxed text-[#111114] dark:text-[#F4F4F6] whitespace-pre-wrap break-words"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="border border-dashed border-[#C5C5CC] dark:border-white/20 p-6 text-center space-y-3 bg-white/50 dark:bg-white/[0.02]">
              <QrCode className="mx-auto h-8 w-8 text-[#FF5A1F]" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                  Upload any QR Code image to scan directly
                </p>
                <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                  Supports PNG, JPG, or WebP QR code files (WiFi passwords, crypto addresses, URLs, etc.).
                </p>
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleStandaloneFileSelected(f);
                  e.target.value = '';
                }}
                className="block mx-auto text-xs text-[#5A5A62] dark:text-[#A1A1AA] file:mr-3 file:py-1.5 file:px-3 file:border-0 file:text-xs file:font-semibold file:bg-[#111114] file:text-white dark:file:bg-[#F4F4F6] dark:file:text-[#111114]"
              />
            </div>

            {standaloneLoading && (
              <p className="text-xs font-mono-code text-[#FF5A1F]">Decoding QR code image…</p>
            )}

            {standaloneError && (
              <div className="flex items-start gap-2.5 border border-[#FF5A1F] bg-[#FF5A1F]/10 p-3 text-xs text-[#B83206] dark:text-[#FF8254]">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#FF5A1F]" />
                <span>{standaloneError}</span>
              </div>
            )}

            {standaloneResult && (
              <motion.div
                ref={standaloneResultRef}
                key={standaloneResult.revealKey}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-[#111114] dark:border-white/30 bg-white dark:bg-[#0B0B0F] p-4 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-[#C5C5CC] dark:border-white/12 pb-2">
                  <span className="font-mono-code text-xs font-semibold text-[#15803D] dark:text-[#4ADE80]">
                    QR Code Decoded Successfully
                  </span>
                  <button
                    type="button"
                    onClick={handleStandaloneCopy}
                    className="chamfer-btn-sm inline-flex items-center gap-1.5 bg-[#FF5A1F] px-3 py-1 font-mono-code text-xs font-semibold text-white"
                  >
                    {standaloneCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="liquid-glass-inset p-3 font-mono-code text-sm break-words whitespace-pre-wrap text-[#111114] dark:text-[#F4F4F6]">
                  {standaloneResult.text}
                </div>
              </motion.div>
            )}
          </div>
        )}
      </LiquidGlassPanel>
    </div>
  );
};

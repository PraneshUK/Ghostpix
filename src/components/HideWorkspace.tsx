import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useReducedMotion, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  HelpCircle,
  Lock,
  Unlock,
  MessageSquareText,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { DropZone, SampleOption } from './DropZone';
import { CapacityMeter } from './CapacityMeter';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { BitViewInspector } from './BitViewInspector';
import { SuccessBurst } from './SuccessBurst';
import { LiquidGlassPanel } from './LiquidGlassPanel';
import {
  LoadedImage,
  formatBytes,
  loadImageFromFile,
  loadImageFromUrl,
  pixelsToLosslessPng,
} from '../utils/canvasHelpers';
import {
  CRYPTO_OVERHEAD_BYTES,
  DEFAULT_PBKDF2_ITERATIONS,
  KDF_PBKDF2_SHA256,
  MIN_PASSWORD_LENGTH,
  SALT_LENGTH,
  IV_LENGTH,
  deriveStegoSeed,
  encryptBytes,
  evaluatePasswordStrength,
} from '../utils/crypto';
import {
  FLAG_ENCRYPTED,
  FLAG_QR_IMAGE,
  FLAG_RANDOMIZED,
  embed,
  encodeUtf8,
} from '../utils/steganography';
import { encodeQrToPngBytes, MAX_QR_UTF8_BYTES, decodeQrImageFile } from '../utils/qrStego';

export interface HideResultState {
  originalUrl: string;
  encodedUrl: string;
  encodedBlob: Blob;
  downloadFilename: string;
  originalPixels: Uint8ClampedArray;
  encodedPixels: Uint8ClampedArray;
  width: number;
  height: number;
  bitsWritten: number;
  changedBits: number;
  modifiedPixelCount: number;
  isEncrypted: boolean;
  isQrImage: boolean;
  qrPreviewUrl?: string;
  qrDownloadFilename?: string;
  qrDimensions?: string;
  burstKey: number;
}

interface QrLivePreview {
  objectUrl: string;
  byteLength: number;
  width: number;
  height: number;
  version: number;
}

interface HideWorkspaceProps {
  onSendToReveal: (file: File) => void;
}

export const HideWorkspace: React.FC<HideWorkspaceProps> = ({ onSendToReveal }) => {
  const prefersReducedMotion = useReducedMotion();
  const messageId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();

  const [image, setImage] = useState<LoadedImage | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [dataSource, setDataSource] = useState<'text' | 'qrUpload'>('text');
  const [message, setMessage] = useState('');
  const [uploadedQr, setUploadedQr] = useState<{
    pngBytes: Uint8Array;
    previewUrl: string;
    text: string;
  } | null>(null);
  const [qrUploadLoading, setQrUploadLoading] = useState(false);
  const [qrUploadError, setQrUploadError] = useState<string | null>(null);

  // Encryption is enabled by default for maximum security
  const [enableEncryption, setEnableEncryption] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [encodeAsQr, setEncodeAsQr] = useState(false);
  const [qrPreview, setQrPreview] = useState<QrLivePreview | null>(null);

  const [isHiding, setIsHiding] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<HideResultState | null>(null);
  const resultContainerRef = useRef<HTMLDivElement | null>(null);

  // Race condition protection for fast consecutive image uploads
  const latestLoadRequestId = useRef(0);

  // Clear sensitive password memory when unmounting
  useEffect(() => {
    return () => {
      setPassword('');
      setConfirmPassword('');
    };
  }, []);

  useEffect(() => {
    return () => {
      if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
    };
  }, [image]);

  useEffect(() => {
    return () => {
      if (result?.encodedUrl) URL.revokeObjectURL(result.encodedUrl);
      if (result?.qrPreviewUrl) URL.revokeObjectURL(result.qrPreviewUrl);
    };
  }, [result]);

  const messageBytes = useMemo(() => encodeUtf8(message).length, [message]);
  const qrTooLong = encodeAsQr && messageBytes > MAX_QR_UTF8_BYTES;

  // Generate live scannable QR PNG preview & byte count when QR mode is active
  useEffect(() => {
    if (!encodeAsQr || messageBytes === 0 || messageBytes > MAX_QR_UTF8_BYTES) {
      setQrPreview(null);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;

    const timer = window.setTimeout(async () => {
      try {
        const qr = await encodeQrToPngBytes(message);
        if (cancelled) return;
        const blob = new Blob([qr.pngBytes as BlobPart], { type: 'image/png' });
        createdUrl = URL.createObjectURL(blob);
        setQrPreview({
          objectUrl: createdUrl,
          byteLength: qr.pngBytes.length,
          width: qr.width,
          height: qr.height,
          version: qr.version,
        });
      } catch {
        if (!cancelled) setQrPreview(null);
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [encodeAsQr, message, messageBytes]);

  useEffect(() => {
    return () => {
      if (qrPreview?.objectUrl) URL.revokeObjectURL(qrPreview.objectUrl);
    };
  }, [qrPreview]);

  const effectivePayloadBytes = useMemo(() => {
    if (dataSource === 'qrUpload' && uploadedQr) {
      return uploadedQr.pngBytes.length;
    }
    if (messageBytes === 0) return 0;
    if (!encodeAsQr) return messageBytes;
    if (qrTooLong) return messageBytes;
    return qrPreview?.byteLength ?? Math.max(600, messageBytes + 550);
  }, [dataSource, uploadedQr, encodeAsQr, messageBytes, qrPreview, qrTooLong]);

  const totalRequiredBytes =
    effectivePayloadBytes > 0
      ? effectivePayloadBytes + (enableEncryption ? CRYPTO_OVERHEAD_BYTES : 0)
      : 0;

  const isOverCapacity = Boolean(image && totalRequiredBytes > image.capacityBytes);
  const hasValidPayload =
    (dataSource === 'qrUpload' ? Boolean(uploadedQr) : message.length > 0) &&
    !isOverCapacity &&
    !qrTooLong;

  const passwordStrength = useMemo(
    () => (enableEncryption ? evaluatePasswordStrength(password) : null),
    [enableEncryption, password]
  );

  const passwordsMatch = !enableEncryption || password === confirmPassword;

  useEffect(() => {
    if (result?.burstKey && resultContainerRef.current) {
      resultContainerRef.current.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
      });
    }
  }, [result?.burstKey, prefersReducedMotion]);

  const resetResult = () => {
    setResult(null);
    setFormError(null);
  };

  const handleFileSelected = async (file: File) => {
    const requestId = ++latestLoadRequestId.current;
    setImageError(null);
    setFormError(null);
    setImageLoading(true);
    try {
      const loaded = await loadImageFromFile(file);
      if (latestLoadRequestId.current !== requestId) {
        if (loaded.previewUrl) URL.revokeObjectURL(loaded.previewUrl);
        return;
      }
      setImage((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return loaded;
      });
      setResult(null);
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

  const handleSampleSelected = async (sample: SampleOption) => {
    const requestId = ++latestLoadRequestId.current;
    setImageError(null);
    setFormError(null);
    setImageLoading(true);
    try {
      const loaded = await loadImageFromUrl(sample.url, sample.filename);
      if (latestLoadRequestId.current !== requestId) {
        if (loaded.previewUrl) URL.revokeObjectURL(loaded.previewUrl);
        return;
      }
      setImage((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return loaded;
      });
      setResult(null);
    } catch (err) {
      if (latestLoadRequestId.current === requestId) {
        setImageError(err instanceof Error ? err.message : 'Unable to load sample photo.');
      }
    } finally {
      if (latestLoadRequestId.current === requestId) {
        setImageLoading(false);
      }
    }
  };

  const handleClearImage = () => {
    setImage((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setImageError(null);
    resetResult();
  };

  const handleHideMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isHiding) return; // Prevent duplicate concurrent processing
    setFormError(null);

    if (!image) {
      setFormError('Please select or drop an image first.');
      return;
    }
    if (dataSource === 'qrUpload' && !uploadedQr) {
      setFormError('Please upload a QR code image file to hide.');
      return;
    }
    if (dataSource === 'text' && message.length === 0) {
      setFormError('Please enter a secret message to hide.');
      return;
    }
    if (qrTooLong) {
      setFormError(
        `QR code mode supports up to ${MAX_QR_UTF8_BYTES.toLocaleString()} UTF-8 bytes. Shorten your message or switch back to plain UTF-8.`
      );
      return;
    }
    if (isOverCapacity) {
      setFormError(
        `Your message requires ${formatBytes(totalRequiredBytes)}, which exceeds this image's ${formatBytes(
          image.capacityBytes
        )} capacity.`
      );
      return;
    }

    if (enableEncryption) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setFormError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Passwords do not match. Please verify your confirmation password.');
        return;
      }
    }

    setIsHiding(true);
    try {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      const scanDurationMs = prefersReducedMotion ? 0 : 900;
      const delayPromise = new Promise((resolve) => setTimeout(resolve, scanDurationMs));

      let rawPayloadBytes: Uint8Array;
      let qrUrl: string | undefined;
      let qrDimensions: string | undefined;

      const isQrMode = dataSource === 'qrUpload' || encodeAsQr;

      if (dataSource === 'qrUpload' && uploadedQr) {
        rawPayloadBytes = uploadedQr.pngBytes;
        qrUrl = uploadedQr.previewUrl;
        qrDimensions = 'Uploaded QR Image';
      } else if (encodeAsQr) {
        const qr = await encodeQrToPngBytes(message);
        rawPayloadBytes = qr.pngBytes;
        qrUrl = URL.createObjectURL(new Blob([qr.pngBytes as BlobPart], { type: 'image/png' }));
        qrDimensions = `${qr.width}×${qr.height} px (v${qr.version})`;
      } else {
        rawPayloadBytes = encodeUtf8(message);
      }

      // Cryptographic processing (GPX2)
      let payloadToEmbed: Uint8Array;
      let salt: Uint8Array | undefined;
      let iv: Uint8Array | undefined;
      let stegoSeed: Uint8Array | undefined;

      if (enableEncryption) {
        salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
        iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
        stegoSeed = await deriveStegoSeed(password, salt);

        // AAD binds GPX2 header metadata to ciphertext:
        // [magic "GPX2" (4B) | version 2 (1B) | flags (1B) | kdfId (1B) | iterations (4B) | payloadLength (4B)]
        const flags = FLAG_ENCRYPTED | (isQrMode ? FLAG_QR_IMAGE : 0) | FLAG_RANDOMIZED;
        const totalPayloadLen = SALT_LENGTH + IV_LENGTH + rawPayloadBytes.length + 16;
        const aad = new Uint8Array(15);
        aad.set([0x47, 0x50, 0x58, 0x32, 0x02, flags, KDF_PBKDF2_SHA256], 0);
        const aadView = new DataView(aad.buffer);
        aadView.setUint32(7, DEFAULT_PBKDF2_ITERATIONS, false);
        aadView.setUint32(11, totalPayloadLen, false);

        payloadToEmbed = await encryptBytes(rawPayloadBytes, password, {
          salt,
          iv,
          iterations: DEFAULT_PBKDF2_ITERATIONS,
          additionalData: aad,
        });
      } else {
        payloadToEmbed = rawPayloadBytes;
      }

      if (payloadToEmbed.length > image.capacityBytes) {
        if (qrUrl && qrUrl !== uploadedQr?.previewUrl) URL.revokeObjectURL(qrUrl);
        throw new Error(
          `Encoded payload (${formatBytes(payloadToEmbed.length)}) exceeds this image's ${formatBytes(
            image.capacityBytes
          )} capacity.`
        );
      }

      const embedResult = embed(image.flattenedPixels, payloadToEmbed, {
        version: 2,
        isEncrypted: enableEncryption,
        isQrImage: isQrMode,
        isRandomized: enableEncryption,
        stegoSeed,
        kdfId: KDF_PBKDF2_SHA256,
        kdfIterations: DEFAULT_PBKDF2_ITERATIONS,
        salt,
        iv,
      });

      const { blob, objectUrl } = await pixelsToLosslessPng(
        embedResult.pixels,
        image.width,
        image.height
      );

      await delayPromise;

      const baseName = image.name.replace(/\.[^.]+$/, '') || 'ghostpix';
      setResult({
        originalUrl: image.previewUrl,
        encodedUrl: objectUrl,
        encodedBlob: blob,
        downloadFilename: `${baseName}-ghostpix.png`,
        originalPixels: image.flattenedPixels,
        encodedPixels: embedResult.pixels,
        width: image.width,
        height: image.height,
        bitsWritten: embedResult.bitsWritten,
        changedBits: embedResult.changedBits,
        modifiedPixelCount: embedResult.modifiedPixelCount,
        isEncrypted: enableEncryption,
        isQrImage: isQrMode,
        qrPreviewUrl: qrUrl,
        qrDownloadFilename: `${baseName}-secret-qr.png`,
        qrDimensions,
        burstKey: Date.now(),
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to hide message.');
    } finally {
      setIsHiding(false);
    }
  };

  const handleDownloadPng = () => {
    if (!result) return;
    const anchor = document.createElement('a');
    anchor.href = result.encodedUrl;
    anchor.download = result.downloadFilename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const handleDownloadQrPng = () => {
    if (!result?.qrPreviewUrl || !result.qrDownloadFilename) return;
    const anchor = document.createElement('a');
    anchor.href = result.qrPreviewUrl;
    anchor.download = result.qrDownloadFilename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const handleTestInReveal = () => {
    if (!result) return;
    const file = new File([result.encodedBlob], result.downloadFilename, {
      type: 'image/png',
    });
    onSendToReveal(file);
  };

  const modeLabel = result
    ? result.isQrImage && result.isEncrypted
      ? 'GPX2 · QR PNG + AES-GCM'
      : result.isQrImage
        ? 'GPX2 · QR Code PNG'
        : result.isEncrypted
          ? 'GPX2 · AES-256-GCM'
          : 'GPX2 · UTF-8 Plain'
    : '';

  const steps = [
    {
      num: '01',
      label: 'Cover image',
      detail: image ? `${image.width}×${image.height} px` : 'PNG / JPG / WebP',
      done: Boolean(image),
    },
    {
      num: '02',
      label: 'Secret payload',
      detail:
        messageBytes > 0
          ? `${totalRequiredBytes.toLocaleString()} B${encodeAsQr ? ' · QR' : ''}`
          : 'UTF-8 or QR + lock',
      done: hasValidPayload,
    },
    {
      num: '03',
      label: 'PNG ready',
      detail: result ? 'Lossless output verified' : 'Export & inspect bits',
      done: Boolean(result),
    },
  ];

  return (
    <div className="space-y-8" data-testid="hide-workspace">
      {/* 3-Step Breadcrumb Progress Bar */}
      <nav
        aria-label="Encoding progress"
        className="grid grid-cols-3 border border-[#C5C5CC] dark:border-white/12 bg-white/70 dark:bg-white/[0.02]"
      >
        {steps.map((st, i) => (
          <div
            key={st.num}
            className={`flex items-center gap-2.5 px-3 py-2.5 sm:px-4 sm:py-3 transition-colors ${
              i < steps.length - 1 ? 'border-r border-[#C5C5CC] dark:border-white/12' : ''
            } ${st.done ? 'bg-[#FF5A1F]/[0.06]' : ''}`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center font-mono-code text-[11px] font-semibold border ${
                st.done
                  ? 'border-[#FF5A1F] bg-[#FF5A1F] text-white'
                  : 'border-[#5A5A62]/40 text-[#5A5A62] dark:text-[#A1A1AA]'
              }`}
            >
              {st.done ? '✓' : st.num}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                {st.label}
              </p>
              <p className="truncate font-mono-code text-[10px] text-[#5A5A62] dark:text-[#A1A1AA]">
                {st.detail}
              </p>
            </div>
          </div>
        ))}
      </nav>

      {/* Main 2-column Layout: Cover Image Picker vs Secret Payload Form */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LiquidGlassPanel
          as="section"
          aria-labelledby="hide-image-heading"
          className="p-5 sm:p-7 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-[#C5C5CC] dark:border-white/12 pb-3">
            <div>
              <h2
                id="hide-image-heading"
                className="font-display text-base font-bold text-[#111114] dark:text-[#F4F4F6]"
              >
                01 · Choose Cover Image
              </h2>
              <p className="text-xs text-[#5A5A62] dark:text-[#A1A1AA]">
                Max 50 MB. Supports PNG, JPG, and WebP (transparent PNGs flattened automatically).
              </p>
            </div>
            {image && (
              <button
                type="button"
                onClick={handleClearImage}
                disabled={isHiding}
                className="inline-flex items-center gap-1 font-mono-code text-xs text-[#5A5A62] dark:text-[#A1A1AA] hover:text-[#FF5A1F] dark:hover:text-[#FF8254] transition-colors"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Replace</span>
              </button>
            )}
          </div>

          <DropZone
            image={image}
            isLoading={imageLoading}
            isScanning={isHiding}
            error={imageError}
            onFileSelected={handleFileSelected}
            onSampleSelected={handleSampleSelected}
            onClear={handleClearImage}
            scanMode="hide"
          />
        </LiquidGlassPanel>

        <LiquidGlassPanel
          as="section"
          aria-labelledby="hide-message-heading"
          className="p-5 sm:p-7 space-y-4"
        >
          <form onSubmit={handleHideMessage} className="space-y-5">
            <div className="flex items-center justify-between border-b border-[#C5C5CC] dark:border-white/12 pb-3">
              <div>
                <h2
                  id="hide-message-heading"
                  className="font-display text-base font-bold text-[#111114] dark:text-[#F4F4F6]"
                >
                  02 · Secret Message & Protection
                </h2>
                <p className="text-xs text-[#5A5A62] dark:text-[#A1A1AA]">
                  Payload is scattered across pixel LSBs with client-side cryptography.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowGuide((g) => !g)}
                aria-expanded={showGuide}
                className="inline-flex items-center gap-1 font-mono-code text-xs text-[#5A5A62] dark:text-[#A1A1AA] hover:text-[#FF5A1F] transition-colors"
              >
                <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Format info</span>
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${showGuide ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </div>

            {showGuide && (
              <div className="border border-[#C5C5CC] dark:border-white/12 bg-white/60 dark:bg-white/[0.02] p-3 text-xs space-y-1.5 text-[#5A5A62] dark:text-[#A1A1AA]">
                <p className="font-semibold text-[#111114] dark:text-[#F4F4F6]">
                  GPX2 Security Architecture:
                </p>
                <p>
                  • <strong>AES-256-GCM</strong> authenticated encryption with 128-bit authentication tag and Additional Authenticated Data (AAD).
                </p>
                <p>
                  • <strong>PBKDF2-HMAC-SHA256</strong> with 600,000 iterations for key stretching.
                </p>
                <p>
                  • <strong>Randomized Embedding</strong>: Password-keyed cycle-walking Feistel permutation distributes bits uniformly across carrier channels.
                </p>
              </div>
            )}

            {/* Data Source Selector: Text Message vs Upload QR Code */}
            <div className="flex flex-wrap items-center justify-between gap-3 border border-[#C5C5CC] dark:border-white/15 bg-white/70 dark:bg-white/[0.03] p-3">
              <span className="text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                Data Source:
              </span>
              <div
                role="tablist"
                aria-label="Select data source for message"
                className="inline-flex border border-[#C5C5CC] dark:border-white/20 bg-[#F5F5F7] dark:bg-[#0B0B0F] p-1 gap-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={dataSource === 'text'}
                  onClick={() => {
                    setDataSource('text');
                    setUploadedQr(null);
                    if (formError) setFormError(null);
                  }}
                  className={`inline-flex min-h-[34px] items-center gap-1.5 px-3 py-1 font-mono-code text-xs font-semibold transition-colors ${
                    dataSource === 'text'
                      ? 'bg-[#FF5A1F] text-white'
                      : 'bg-transparent text-[#5A5A62] dark:text-[#A1A1AA] hover:text-[#111114] dark:hover:text-white'
                  }`}
                >
                  <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Text Message</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={dataSource === 'qrUpload'}
                  onClick={() => {
                    setDataSource('qrUpload');
                    if (formError) setFormError(null);
                  }}
                  className={`inline-flex min-h-[34px] items-center gap-1.5 px-3 py-1 font-mono-code text-xs font-semibold transition-colors ${
                    dataSource === 'qrUpload'
                      ? 'bg-[#111114] dark:bg-[#F4F4F6] text-white dark:text-[#111114]'
                      : 'bg-transparent text-[#5A5A62] dark:text-[#A1A1AA] hover:text-[#111114] dark:hover:text-white'
                  }`}
                >
                  <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Upload QR Code</span>
                </button>
              </div>
            </div>

            {dataSource === 'text' ? (
              <div className="space-y-2">
                <label
                  htmlFor={messageId}
                  className="block text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]"
                >
                  Message text (all languages & emoji supported)
                </label>
                <textarea
                  id={messageId}
                  rows={5}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="Write anything secret… English, தமிழ், 日本語, or 👻🔐"
                  className="font-mono-code liquid-glass-inset w-full resize-y px-4 py-3 text-sm text-[#111114] dark:text-[#F4F4F6] placeholder-[#5A5A62]/65 dark:placeholder-[#A1A1AA]/60 transition-colors focus:border-[#111114] dark:focus:border-white/45 focus:outline-none"
                />
              </div>
            ) : (
              <div className="space-y-3 border border-[#C5C5CC] dark:border-white/15 bg-white/70 dark:bg-white/[0.03] p-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                    Upload existing QR code image file
                  </p>
                  <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                    Drop any QR image (PNG, JPG, WebP). Ghostpix re-encodes it into a pristine PNG layer before embedding.
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setQrUploadError(null);
                      setQrUploadLoading(true);
                      try {
                        const decoded = await decodeQrImageFile(file);
                        setUploadedQr(decoded);
                        setMessage(decoded.text);
                      } catch (err) {
                        setQrUploadError(
                          err instanceof Error ? err.message : 'Could not decode QR code image.'
                        );
                      } finally {
                        setQrUploadLoading(false);
                      }
                    }
                    e.target.value = '';
                  }}
                  className="block w-full text-xs text-[#5A5A62] dark:text-[#A1A1AA] file:mr-4 file:py-2 file:px-4 file:border-0 file:text-xs file:font-semibold file:bg-[#111114] file:text-white dark:file:bg-[#F4F4F6] dark:file:text-[#111114] hover:file:bg-[#FF5A1F]"
                />
                {qrUploadLoading && (
                  <p className="text-xs font-mono-code text-[#FF5A1F]">Decoding and standardizing QR image…</p>
                )}
                {qrUploadError && (
                  <p className="text-xs font-mono-code text-[#FF5A1F]">{qrUploadError}</p>
                )}
                {uploadedQr && (
                  <div className="flex items-center gap-3 border border-[#15803D]/30 bg-[#15803D]/[0.06] p-3">
                    <img
                      src={uploadedQr.previewUrl}
                      alt="Uploaded QR preview"
                      className="h-16 w-16 bg-white p-0.5 object-contain"
                    />
                    <div className="min-w-0 space-y-0.5 font-mono-code text-xs">
                      <p className="font-semibold text-[#15803D] dark:text-[#4ADE80]">
                        QR Code Decoded & Re-encoded as PNG
                      </p>
                      <p className="truncate text-[#111114] dark:text-[#F4F4F6]">{uploadedQr.text}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Optional QR Code Image Layer Toggle for text mode */}
            {dataSource === 'text' && (
              <div className="border border-[#C5C5CC] dark:border-white/15 bg-white/70 dark:bg-white/[0.03] p-3.5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <QrCode
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        encodeAsQr ? 'text-[#FF5A1F]' : 'text-[#5A5A62] dark:text-[#A1A1AA]'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                        Encode message as QR code image
                      </p>
                      <p className="text-[11px] leading-relaxed text-[#5A5A62] dark:text-[#A1A1AA]">
                        Converts secret into a scannable PNG QR code layer before embedding.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={encodeAsQr}
                    aria-label="Encode message as QR code image"
                    onClick={() => {
                      setEncodeAsQr((prev) => !prev);
                      if (formError) setFormError(null);
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A1F] ${
                      encodeAsQr
                        ? 'border-[#FF5A1F] bg-[#FF5A1F]'
                        : 'border-[#C5C5CC] dark:border-white/25 bg-[#DFDFE3] dark:bg-white/10'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform bg-white transition-transform duration-150 ${
                        encodeAsQr ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {encodeAsQr && qrTooLong && (
                  <p className="font-mono-code text-[11px] font-medium text-[#FF5A1F] dark:text-[#FF8254]">
                    Message exceeds {MAX_QR_UTF8_BYTES.toLocaleString()} UTF-8 byte QR limit (currently{' '}
                    {messageBytes.toLocaleString()} bytes).
                  </p>
                )}

                {encodeAsQr && !qrTooLong && qrPreview && (
                  <div
                    data-testid="qr-live-preview"
                    className="flex items-center gap-3 border-t border-[#C5C5CC] dark:border-white/12 pt-3"
                  >
                    <img
                      src={qrPreview.objectUrl}
                      alt="Live preview of generated QR code"
                      style={{ imageRendering: 'pixelated' }}
                      className="h-14 w-14 shrink-0 border border-[#C5C5CC] dark:border-white/20 bg-white p-0.5"
                    />
                    <div className="min-w-0 space-y-0.5 font-mono-code text-[11px]">
                      <p className="font-semibold text-[#111114] dark:text-[#F4F4F6]">
                        QR v{qrPreview.version} · {qrPreview.width}×{qrPreview.height} px
                      </p>
                      <p className="text-[#5A5A62] dark:text-[#A1A1AA]">
                        Payload size: {formatBytes(qrPreview.byteLength)} lossless PNG
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Encryption & Password Hardening Panel (Enabled by Default) */}
            <div className="border border-[#C5C5CC] dark:border-white/15 bg-white/70 dark:bg-white/[0.03] p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Lock
                    className={`h-4 w-4 ${
                      enableEncryption ? 'text-[#FF5A1F]' : 'text-[#5A5A62] dark:text-[#A1A1AA]'
                    }`}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                      AES-256-GCM Encryption
                    </p>
                    <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                      Locks secret with 600,000 PBKDF2 iterations and pseudo-random Feistel scattering.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={enableEncryption}
                  aria-label="Enable AES-256-GCM encryption"
                  onClick={() => {
                    setEnableEncryption((prev) => !prev);
                    if (formError) setFormError(null);
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A1F] ${
                    enableEncryption
                      ? 'border-[#FF5A1F] bg-[#FF5A1F]'
                      : 'border-[#C5C5CC] dark:border-white/25 bg-[#DFDFE3] dark:bg-white/10'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform bg-white transition-transform duration-150 ${
                      enableEncryption ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {!enableEncryption ? (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 border border-[#FF5A1F] bg-[#FF5A1F]/10 p-3 text-xs text-[#B83206] dark:text-[#FF8254]"
                >
                  <Unlock className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A1F]" aria-hidden="true" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Warning: Encryption is disabled!</p>
                    <p className="leading-relaxed">
                      Anyone who inspects the pixel LSBs can immediately read your secret message without a password.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-1 border-t border-[#C5C5CC]/60 dark:border-white/10">
                  {/* Password Input */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={passwordId}
                        className="text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]"
                      >
                        Encryption Password
                      </label>
                      {passwordStrength && (
                        <span className="font-mono-code text-[11px] font-semibold text-[#FF5A1F] dark:text-[#FF8254]">
                          {passwordStrength.label}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        id={passwordId}
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (formError) setFormError(null);
                        }}
                        placeholder="At least 8 characters (passphrase recommended)"
                        autoComplete="new-password"
                        className="liquid-glass-inset w-full min-h-[42px] py-2 pr-11 pl-3.5 text-sm font-mono-code text-[#111114] dark:text-[#F4F4F6] placeholder-[#5A5A62]/65 dark:placeholder-[#A1A1AA]/60 transition-colors focus:border-[#111114] dark:focus:border-white/45 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute top-1/2 right-2 -translate-y-1/2 flex h-8 w-8 items-center justify-center text-[#5A5A62] dark:text-[#A1A1AA] hover:text-[#111114] dark:hover:text-white"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {passwordStrength && (
                      <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                        {passwordStrength.feedback}
                      </p>
                    )}
                  </div>

                  {/* Password Confirmation */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor={confirmPasswordId}
                      className="text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]"
                    >
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        id={confirmPasswordId}
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (formError) setFormError(null);
                        }}
                        placeholder="Re-type your password"
                        autoComplete="new-password"
                        className={`liquid-glass-inset w-full min-h-[42px] py-2 pr-11 pl-3.5 text-sm font-mono-code text-[#111114] dark:text-[#F4F4F6] placeholder-[#5A5A62]/65 dark:placeholder-[#A1A1AA]/60 transition-colors focus:outline-none ${
                          confirmPassword && !passwordsMatch
                            ? 'border-red-500 focus:border-red-500'
                            : 'focus:border-[#111114] dark:focus:border-white/45'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((s) => !s)}
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                        className="absolute top-1/2 right-2 -translate-y-1/2 flex h-8 w-8 items-center justify-center text-[#5A5A62] dark:text-[#A1A1AA] hover:text-[#111114] dark:hover:text-white"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {confirmPassword && !passwordsMatch && (
                      <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                        Passwords do not match.
                      </p>
                    )}
                    {confirmPassword && passwordsMatch && (
                      <p className="text-[11px] font-medium text-[#15803D] dark:text-[#4ADE80] flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Passwords match.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <CapacityMeter
              usedBytes={effectivePayloadBytes}
              maxBytes={image?.capacityBytes ?? 0}
              hasImage={Boolean(image)}
              isEncrypted={enableEncryption}
              isQrMode={encodeAsQr}
            />

            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 border border-[#FF5A1F] bg-[#FF5A1F]/10 px-3.5 py-2.5 text-xs font-medium text-[#B83206] dark:text-[#FF8254]"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A1F]" aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <motion.button
              type="submit"
              disabled={
                isHiding ||
                imageLoading ||
                isOverCapacity ||
                qrTooLong ||
                (enableEncryption && (password.length < MIN_PASSWORD_LENGTH || !passwordsMatch))
              }
              whileHover={prefersReducedMotion || isOverCapacity || qrTooLong ? undefined : { y: -1 }}
              whileTap={prefersReducedMotion || isOverCapacity || qrTooLong ? undefined : { scale: 0.985 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              className={`chamfer-btn btn-kinetic-bevel btn-hover-glint group relative flex w-full min-h-[50px] items-center justify-between overflow-hidden px-5 py-3 font-mono-code text-sm font-semibold tracking-wide transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A1F] ${
                isOverCapacity ||
                qrTooLong ||
                (enableEncryption && (password.length < MIN_PASSWORD_LENGTH || !passwordsMatch))
                  ? 'cursor-not-allowed border border-[#C5C5CC] dark:border-white/20 bg-gray-200 dark:bg-white/10 text-[#5A5A62] dark:text-[#A1A1AA]'
                  : 'bg-[#FF5A1F] text-white hover:bg-[#111114] dark:hover:bg-[#F4F4F6] dark:hover:text-[#111114]'
              }`}
            >
              {isHiding && !prefersReducedMotion && (
                <span
                  aria-hidden="true"
                  className="btn-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-2.5">
                {encodeAsQr ? (
                  <QrCode className="h-4 w-4" aria-hidden="true" />
                ) : enableEncryption ? (
                  <Lock className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Unlock className="h-4 w-4" aria-hidden="true" />
                )}
                <span>
                  {isHiding
                    ? 'Deriving key & embedding in pixels…'
                    : encodeAsQr
                      ? 'Hide QR Message'
                      : enableEncryption
                        ? 'Encrypt & Hide Secret'
                        : 'Hide Plaintext Secret'}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="relative z-10 flex h-7 w-7 items-center justify-center bg-white/20 dark:bg-black/15"
              >
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </motion.button>
          </form>
        </LiquidGlassPanel>
      </div>

      {result && (
        <div ref={resultContainerRef} className="scroll-mt-24">
          <LiquidGlassPanel
            as="section"
            key={result.burstKey}
            aria-labelledby="hide-result-heading"
            data-testid="hide-result-section"
            className="p-5 sm:p-7 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#C5C5CC] dark:border-white/12 pb-5">
              <div className="flex items-center gap-3.5">
                <SuccessBurst burstKey={result.burstKey} isEncrypted={result.isEncrypted} />
                <div>
                  <h2
                    id="hide-result-heading"
                    className="font-display text-xl font-bold tracking-tight text-[#111114] dark:text-[#F4F4F6]"
                  >
                    Secret hidden in plain sight
                  </h2>
                  <p className="text-xs sm:text-sm text-[#5A5A62] dark:text-[#A1A1AA]">
                    Lossless PNG ready — inspect LSB delta or verify extraction below.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleTestInReveal}
                  className="chamfer-btn-sm flex-1 sm:flex-initial inline-flex min-h-[44px] items-center justify-center gap-2 border border-[#C5C5CC] dark:border-white/20 bg-white dark:bg-[#18181F] px-4 py-2.5 font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6] transition-colors hover:border-[#111114] dark:hover:border-white whitespace-nowrap shrink-0"
                >
                  <span>Verify in Reveal</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPng}
                  className="chamfer-btn-sm btn-hover-glint flex-1 sm:flex-initial inline-flex min-h-[44px] items-center justify-center gap-2 bg-[#FF5A1F] px-5 py-2.5 font-mono-code text-xs font-semibold text-white transition-colors hover:bg-[#111114] dark:hover:bg-[#F4F4F6] dark:hover:text-[#111114] whitespace-nowrap shrink-0"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>Download PNG</span>
                </button>
              </div>
            </div>

            {/* 4-cell reference metric strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 divide-x divide-[#C5C5CC] dark:divide-white/12 border border-[#C5C5CC] dark:border-white/15 bg-white dark:bg-[#141419]">
              <div className="px-4 py-3">
                <p className="font-mono-code text-sm font-semibold text-[#111114] dark:text-[#F4F4F6]">
                  {result.bitsWritten.toLocaleString()}
                </p>
                <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">Bits Embedded</p>
              </div>
              <div className="px-4 py-3">
                <p className="font-mono-code text-sm font-semibold text-[#FF5A1F]">
                  {result.changedBits.toLocaleString()}
                </p>
                <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">LSBs Flipped</p>
              </div>
              <div className="px-4 py-3">
                <p className="font-mono-code text-sm font-semibold text-[#111114] dark:text-[#F4F4F6]">
                  {result.modifiedPixelCount.toLocaleString()}
                </p>
                <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">Pixels Modified</p>
              </div>
              <div className="px-4 py-3">
                <p className="font-mono-code text-sm font-semibold text-[#111114] dark:text-[#F4F4F6]">
                  {modeLabel}
                </p>
                <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">Format Version</p>
              </div>
            </div>

            {result.isQrImage && result.qrPreviewUrl && (
              <div
                data-testid="hide-qr-result-card"
                className="flex flex-wrap items-center justify-between gap-4 border border-[#C5C5CC] dark:border-white/15 bg-white dark:bg-[#141419] p-4"
              >
                <div className="flex items-center gap-4">
                  <img
                    src={result.qrPreviewUrl}
                    alt="Embedded QR code image"
                    style={{ imageRendering: 'pixelated' }}
                    className="h-24 w-24 shrink-0 border border-[#C5C5CC] dark:border-white/20 bg-white p-1"
                  />
                  <div className="space-y-1">
                    <p className="font-mono-code text-xs font-semibold text-[#FF5A1F]">
                      SECONDARY DATA LAYER · QR CODE IMAGE
                    </p>
                    <h3 className="font-display text-sm font-bold text-[#111114] dark:text-[#F4F4F6]">
                      Scannable QR PNG embedded inside carrier LSBs ({result.qrDimensions})
                    </h3>
                    <p className="text-xs text-[#5A5A62] dark:text-[#A1A1AA]">
                      Reveal Inspector extracts both this scannable QR image and its decoded text.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadQrPng}
                  className="chamfer-btn-sm inline-flex min-h-[40px] items-center gap-2 border border-[#C5C5CC] dark:border-white/20 bg-[#F5F5F7] dark:bg-[#18181F] px-4 py-2 font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6] transition-colors hover:border-[#FF5A1F] whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Download QR PNG</span>
                </button>
              </div>
            )}

            <div
              role="note"
              className="flex items-start gap-3 border border-[#FF5A1F]/45 bg-[#FF5A1F]/[0.08] px-4 py-3 text-xs sm:text-sm text-[#111114] dark:text-[#F4F4F6]"
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A1F]" aria-hidden="true" />
              <p className="leading-relaxed">
                <strong className="font-bold text-[#FF5A1F] dark:text-[#FF8254]">Important:</strong>{' '}
                Send this image as an uncompressed <strong>FILE</strong> or <strong>DOCUMENT</strong>. Social media apps (WhatsApp, Instagram, Messenger) recompress images to lossy JPEG and destroy LSB steganographic payloads.
              </p>
            </div>

            <BeforeAfterSlider originalUrl={result.originalUrl} encodedUrl={result.encodedUrl} />

            <BitViewInspector
              originalPixels={result.originalPixels}
              encodedPixels={result.encodedPixels}
              width={result.width}
              height={result.height}
            />
          </LiquidGlassPanel>
        </div>
      )}
    </div>
  );
};

import React, { useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Activity,
  Cpu,
  FileWarning,
  Lock,
  Unlock,
  AlertCircle,
} from 'lucide-react';
import { HeaderPeekResult } from '../utils/steganography';
import { LoadedImage } from '../utils/canvasHelpers';

export type SecurityAuditStatus =
  | 'NO_MESSAGE'
  | 'HEADER_DETECTED'
  | 'ENCRYPTED_UNVERIFIED'
  | 'AUTHENTICATED'
  | 'PLAINTEXT'
  | 'AUTH_FAILED'
  | 'CORRUPTED';

interface SecurityAuditPanelProps {
  image: LoadedImage | null;
  headerPeek: HeaderPeekResult | null;
  auditStatus?: SecurityAuditStatus;
  authError?: string | null;
}

export const SecurityAuditPanel: React.FC<SecurityAuditPanelProps> = ({
  image,
  headerPeek,
  auditStatus,
  authError,
}) => {
  const auditMetrics = useMemo(() => {
    if (!image || !headerPeek) return null;

    const pixels = image.originalPixels;
    const pixelCount = pixels.length / 4;

    // Calculate Shannon entropy on sample of extracted LSB bits
    const sampleBytesCount = Math.min(Math.floor((pixelCount * 3) / 8), 1024);
    const sampleBytes = new Uint8Array(sampleBytesCount);
    for (let i = 0; i < sampleBytesCount * 8; i++) {
      const pIdx = Math.floor(i / 3);
      const ch = i % 3;
      const bit = pixels[pIdx * 4 + ch] & 1;
      const bIdx = i >> 3;
      sampleBytes[bIdx] |= bit << (7 - (i & 7));
    }

    const freq = new Array(256).fill(0);
    for (let i = 0; i < sampleBytes.length; i++) {
      freq[sampleBytes[i]]++;
    }

    let entropy = 0;
    const len = sampleBytes.length;
    if (len > 0) {
      for (let i = 0; i < 256; i++) {
        if (freq[i] > 0) {
          const p = freq[i] / len;
          entropy -= p * Math.log2(p);
        }
      }
    }

    // Determine accurate state
    let state: SecurityAuditStatus;
    if (auditStatus) {
      state = auditStatus;
    } else if (authError) {
      state = 'AUTH_FAILED';
    } else if (headerPeek.isCorrupted) {
      state = 'CORRUPTED';
    } else if (!headerPeek.hasGhostpixHeader) {
      state = 'NO_MESSAGE';
    } else if (headerPeek.isEncrypted) {
      state = 'ENCRYPTED_UNVERIFIED';
    } else {
      state = 'PLAINTEXT';
    }

    let statusLabel = '';
    let statusText = '';
    let statusLevel: 'neutral' | 'verified' | 'warning' | 'error' = 'neutral';

    switch (state) {
      case 'NO_MESSAGE':
        statusLabel = 'No Hidden Message';
        statusText = 'No hidden message detected.';
        statusLevel = 'neutral';
        break;
      case 'HEADER_DETECTED':
        statusLabel = 'Header Detected';
        statusText = 'Hidden message header detected.';
        statusLevel = 'neutral';
        break;
      case 'ENCRYPTED_UNVERIFIED':
        statusLabel = 'Encrypted (Unverified)';
        statusText = 'Encrypted message – authentication not yet verified. Enter password to unlock and verify.';
        statusLevel = 'warning';
        break;
      case 'AUTHENTICATED':
        statusLabel = 'Authenticated';
        statusText = 'Encrypted message successfully authenticated. AES-GCM 128-bit tag verified.';
        statusLevel = 'verified';
        break;
      case 'PLAINTEXT':
        statusLabel = 'Plaintext (Unencrypted)';
        statusText = 'Plaintext message – not encrypted. Anyone inspecting pixel LSBs can read this secret.';
        statusLevel = 'warning';
        break;
      case 'AUTH_FAILED':
        statusLabel = 'Authentication Failed';
        statusText = 'Authentication failed. Incorrect password or modified ciphertext payload.';
        statusLevel = 'error';
        break;
      case 'CORRUPTED':
        statusLabel = 'Corrupted / Unsupported';
        statusText = 'Corrupted or unsupported image. Header CRC-32 or structure check failed.';
        statusLevel = 'error';
        break;
    }

    const versionLabel =
      headerPeek.version === 2 ? 'GPX2 (Hardened)' : headerPeek.version === 1 ? 'GPX1 (Legacy)' : 'None';

    return {
      state,
      statusLabel,
      statusText,
      statusLevel,
      entropy: entropy.toFixed(2),
      isLossy: image.isLossySource,
      versionLabel,
      pixelCount: pixelCount.toLocaleString(),
      maxCapacityBytes: Math.max(0, Math.floor((pixelCount * 3) / 8) - (headerPeek.version === 1 ? 9 : 47)).toLocaleString(),
      payloadBytes: headerPeek.payloadBytes.toLocaleString(),
      kdfInfo: headerPeek.kdfIterations ? `PBKDF2 ${headerPeek.kdfIterations.toLocaleString()} iters` : 'N/A',
      isRandomized: headerPeek.isRandomized,
    };
  }, [image, headerPeek, auditStatus, authError]);

  if (!image || !headerPeek || !auditMetrics) {
    return null;
  }

  return (
    <div
      data-testid="security-audit-panel"
      className="border border-[#111114] dark:border-white/20 bg-white/85 dark:bg-[#0B0B0F]/90 p-4 sm:p-5 space-y-4"
    >
      <div className="flex items-center justify-between border-b border-[#C5C5CC] dark:border-white/12 pb-3">
        <div className="flex items-center gap-2.5">
          <Activity className="h-4 w-4 text-[#FF5A1F]" aria-hidden="true" />
          <h3 className="font-mono-code text-xs font-semibold uppercase tracking-wider text-[#111114] dark:text-[#F4F4F6]">
            Security Audit & Diagnostics
          </h3>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 font-mono-code text-[11px] font-semibold border ${
            auditMetrics.statusLevel === 'verified'
              ? 'border-[#15803D]/40 bg-[#15803D]/10 text-[#15803D] dark:text-[#4ADE80]'
              : auditMetrics.statusLevel === 'warning'
              ? 'border-[#FF5A1F]/40 bg-[#FF5A1F]/10 text-[#FF5A1F]'
              : auditMetrics.statusLevel === 'error'
              ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
              : 'border-[#5A5A62]/40 bg-[#5A5A62]/10 text-[#5A5A62] dark:text-[#A1A1AA]'
          }`}
        >
          {auditMetrics.statusLevel === 'verified' ? (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          ) : auditMetrics.statusLevel === 'warning' ? (
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          ) : auditMetrics.statusLevel === 'error' ? (
            <ShieldX className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>{auditMetrics.statusLabel}</span>
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-[#111114] dark:text-[#F4F4F6]">
          {auditMetrics.statusText}
        </p>
        {auditMetrics.isLossy && (
          <p className="text-[11px] text-[#FF5A1F] flex items-center gap-1">
            <FileWarning className="h-3 w-3" />
            Warning: Lossy source format detected (JPEG/WebP recompression destroys LSB data).
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="border border-[#C5C5CC]/60 dark:border-white/10 bg-[#F5F5F7] dark:bg-white/[0.02] p-2.5 space-y-1">
          <p className="font-mono-code text-[10px] text-[#5A5A62] dark:text-[#A1A1AA]">FORMAT / VERSION</p>
          <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
            {auditMetrics.versionLabel}
          </p>
        </div>

        <div className="border border-[#C5C5CC]/60 dark:border-white/10 bg-[#F5F5F7] dark:bg-white/[0.02] p-2.5 space-y-1">
          <p className="font-mono-code text-[10px] text-[#5A5A62] dark:text-[#A1A1AA]">DISTRIBUTION</p>
          <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
            {auditMetrics.isRandomized ? 'Randomized Feistel' : 'Sequential LSB'}
          </p>
        </div>

        <div className="border border-[#C5C5CC]/60 dark:border-white/10 bg-[#F5F5F7] dark:bg-white/[0.02] p-2.5 space-y-1">
          <p className="font-mono-code text-[10px] text-[#5A5A62] dark:text-[#A1A1AA]">KEY STRETCHING</p>
          <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
            {auditMetrics.kdfInfo}
          </p>
        </div>

        <div className="border border-[#C5C5CC]/60 dark:border-white/10 bg-[#F5F5F7] dark:bg-white/[0.02] p-2.5 space-y-1">
          <p className="font-mono-code text-[10px] text-[#5A5A62] dark:text-[#A1A1AA]">PAYLOAD / CAPACITY</p>
          <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
            {auditMetrics.payloadBytes} / {auditMetrics.maxCapacityBytes} B
          </p>
        </div>
      </div>

      <div className="border-t border-[#C5C5CC]/50 dark:border-white/10 pt-2 text-[10px] text-[#5A5A62] dark:text-[#A1A1AA] space-y-1">
        <div className="flex items-center gap-1.5">
          <Cpu className="h-3 w-3 text-[#FF5A1F]" aria-hidden="true" />
          <span>LSB Shannon entropy: <strong>{auditMetrics.entropy} bits/byte</strong> across {auditMetrics.pixelCount} pixels.</span>
        </div>
        <p className="leading-relaxed text-[10px]">
          * Steganography Notice: LSB modification scatters bits but alters statistical bit variance. It does not provide mathematical undetectability against statistical steganalysis (e.g. sample pair or chi-squared testing).
        </p>
      </div>
    </div>
  );
};

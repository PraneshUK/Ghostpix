import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { formatBytes } from '../utils/canvasHelpers';
import { CRYPTO_OVERHEAD_BYTES } from '../utils/crypto';

interface CapacityMeterProps {
  usedBytes: number;
  maxBytes: number;
  hasImage: boolean;
  isEncrypted: boolean;
  isQrMode?: boolean;
}

export const CapacityMeter: React.FC<CapacityMeterProps> = ({
  usedBytes,
  maxBytes,
  hasImage,
  isEncrypted,
  isQrMode = false,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const effectiveOverhead = isEncrypted ? CRYPTO_OVERHEAD_BYTES : 0;
  const totalRequired = usedBytes > 0 ? usedBytes + effectiveOverhead : 0;
  const ratio = hasImage && maxBytes > 0 ? totalRequired / maxBytes : 0;
  const clampedPercent = Math.min(100, Math.max(0, ratio * 100));
  const isOverflow = hasImage && totalRequired > maxBytes;
  const isNearlyFull = hasImage && !isOverflow && ratio >= 0.8;
  const remainingBytes = hasImage ? Math.max(0, maxBytes - totalRequired) : 0;

  return (
    <div
      className="space-y-2 border-t border-[#C5C5CC] dark:border-white/12 pt-4"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-[#111114] dark:text-[#F4F4F6]">
          Image capacity
          {(isQrMode || isEncrypted) && usedBytes > 0 && (
            <span className="font-normal text-[#5A5A62] dark:text-[#A1A1AA]">
              {' '}
              ({isQrMode ? 'QR PNG' : ''}
              {isQrMode && isEncrypted ? ' + ' : ''}
              {isEncrypted ? `+${CRYPTO_OVERHEAD_BYTES} B AES-GCM` : ''})
            </span>
          )}
        </span>

        {hasImage ? (
          <span
            className={`font-mono-code font-medium ${
              isOverflow || isNearlyFull
                ? 'text-[#FF5A1F] dark:text-[#FF8254]'
                : 'text-[#111114] dark:text-[#F4F4F6]'
            }`}
          >
            {formatBytes(totalRequired)} / {formatBytes(maxBytes)}
          </span>
        ) : (
          <span className="font-mono-code text-[#5A5A62] dark:text-[#A1A1AA]">Awaiting image</span>
        )}
      </div>

      <div
        role="progressbar"
        aria-label="Message capacity usage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clampedPercent)}
        className="relative h-2.5 w-full overflow-hidden border border-[#C5C5CC] dark:border-white/15 bg-[#DFDFE3] dark:bg-white/10"
      >
        <motion.div
          animate={{ scaleX: hasImage ? clampedPercent / 100 : 0 }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 260, damping: 28 }
          }
          className={`relative h-full w-full origin-left overflow-hidden ${
            isOverflow
              ? 'bg-[#DC2626]'
              : isNearlyFull
                ? 'bg-[#FF5A1F]'
                : 'bg-[#111114] dark:bg-[#F4F4F6]'
          }`}
        >
          {hasImage && clampedPercent > 0 && (
            <span
              aria-hidden="true"
              className="capacity-stripes pointer-events-none absolute inset-y-0 -left-6 right-0 opacity-75"
            />
          )}
        </motion.div>
      </div>

      {hasImage && (
        <div className="flex items-center justify-between gap-2 text-xs">
          {isOverflow ? (
            <p className="inline-flex items-center gap-1.5 font-semibold text-[#DC2626] dark:text-[#F87171]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Exceeds capacity by {formatBytes(totalRequired - maxBytes)}. Shorten message or use
                a larger photo.
              </span>
            </p>
          ) : isNearlyFull ? (
            <p className="inline-flex items-center gap-1.5 font-semibold text-[#FF5A1F] dark:text-[#FF8254]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Almost full — {remainingBytes.toLocaleString()} bytes left.</span>
            </p>
          ) : (
            <p className="text-[#5A5A62] dark:text-[#A1A1AA]">
              Remaining:{' '}
              <span className="font-mono-code font-medium text-[#111114] dark:text-[#F4F4F6]">
                {remainingBytes.toLocaleString()}
              </span>{' '}
              bytes (1 ASCII char = 1 byte)
            </p>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertCircle, ArrowRight, ImagePlus, RefreshCw, X } from 'lucide-react';
import { LoadedImage, formatBytes } from '../utils/canvasHelpers';
import sampleAuroraUrl from '../assets/images/sample_aurora_fjord_1794768744275.jpg';
import samplePrismUrl from '../assets/images/sample_prism_glass_1794768741006.jpg';

export interface SampleOption {
  id: string;
  label: string;
  url: string;
  filename: string;
}

export const SAMPLE_PHOTOS: SampleOption[] = [
  {
    id: 'aurora',
    label: 'Aurora Fjord',
    url: sampleAuroraUrl,
    filename: 'aurora-fjord.jpg',
  },
  {
    id: 'prism',
    label: 'Glass Prisms',
    url: samplePrismUrl,
    filename: 'glass-prisms.jpg',
  },
];

interface DropZoneProps {
  image: LoadedImage | null;
  onFileSelected: (file: File) => void;
  onSampleSelected?: (sample: SampleOption) => void;
  onClear: () => void;
  isLoading: boolean;
  isScanning: boolean;
  scanMode?: 'hide' | 'reveal';
  error: string | null;
  acceptLabel?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  showSamples?: boolean;
}

const BINARY_PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  bit: i % 2 === 0 ? '0' : '1',
  left: `${6 + ((i * 19) % 88)}%`,
  delay: (i % 6) * 0.14,
  duration: 1.1 + (i % 4) * 0.25,
}));

export const DropZone: React.FC<DropZoneProps> = ({
  image,
  onFileSelected,
  onSampleSelected,
  onClear,
  isLoading,
  isScanning,
  scanMode = 'hide',
  error,
  acceptLabel = 'PNG, JPG, or WebP up to 24 MP',
  emptyTitle = 'Drop your cover image here',
  emptySubtitle = 'or choose a file directly from your device',
  showSamples = true,
}) => {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isLoading || isScanning) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const pastedFile = item.getAsFile();
          if (pastedFile) {
            e.preventDefault();
            onFileSelected(pastedFile);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isLoading, isScanning, onFileSelected]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelected(file);
    }
    e.target.value = '';
  };

  const handlePreviewMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({
      rotateX: -y * 4,
      rotateY: x * 4,
    });
  };

  const handlePreviewMouseLeave = () => {
    setTilt({ rotateX: 0, rotateY: 0 });
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleInputChange}
        className="hidden"
      />

      {!image ? (
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border border-dashed p-6 sm:p-8 text-center transition-colors duration-200 ${
            isDragging
              ? 'border-[#FF5A1F] bg-[#FF5A1F]/[0.08]'
              : 'border-[#B5B5BE] bg-white/70 hover:border-[#111114]/65 hover:bg-white dark:border-white/20 dark:bg-white/[0.03] dark:hover:border-white/45 dark:hover:bg-white/[0.06]'
          }`}
        >
          {isDragging && !prefersReducedMotion && (
            <div
              aria-hidden="true"
              className="dropzone-beacon pointer-events-none absolute inset-0"
            />
          )}

          <div className="mx-auto flex max-w-xs flex-col items-center gap-3.5 py-2">
            <div className="flex h-12 w-12 items-center justify-center border border-[#C5C5CC] dark:border-white/20 bg-white dark:bg-[#18181F] text-[#111114] dark:text-[#F4F4F6] transition-transform duration-300 hover:scale-105">
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
            </div>

            <div className="space-y-1">
              <p className="font-display text-base font-bold tracking-tight text-[#111114] dark:text-[#F4F4F6]">
                {isLoading ? 'Loading image into Canvas…' : emptyTitle}
              </p>
              <p className="text-xs sm:text-sm text-[#5A5A62] dark:text-[#A1A1AA]">
                {emptySubtitle}
              </p>
            </div>

            <motion.button
              type="button"
              whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              onClick={() => inputRef.current?.click()}
              className="chamfer-btn-sm btn-hover-glint mt-1 inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2.5 bg-[#111114] dark:bg-[#F4F4F6] px-5 py-2.5 font-mono-code text-xs font-semibold tracking-wide text-white dark:text-[#111114] transition-colors hover:bg-[#FF5A1F] dark:hover:bg-[#FF5A1F] dark:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A1F] whitespace-nowrap shrink-0"
            >
              <span>Choose Image</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </motion.button>

            <p className="font-mono-code text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
              {acceptLabel} · Paste image with Ctrl+V
            </p>
          </div>
        </div>
      ) : (
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onMouseMove={handlePreviewMouseMove}
          onMouseLeave={handlePreviewMouseLeave}
          className="relative overflow-hidden border border-[#C5C5CC] dark:border-white/15 bg-[#DFDFE3] dark:bg-[#141419]"
          style={{ perspective: '900px' }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[#FF5A1F]"
          />

          <motion.div
            animate={
              prefersReducedMotion
                ? undefined
                : { rotateX: tilt.rotateX, rotateY: tilt.rotateY }
            }
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="relative aspect-[4/3] w-full overflow-hidden p-3 sm:p-4"
          >
            <img
              src={image.previewUrl}
              alt={`Selected cover image: ${image.name}`}
              className="h-full w-full bg-[#111114] object-contain"
              referrerPolicy="no-referrer"
            />

            {isScanning && (
              <div
                aria-hidden="true"
                data-testid="scanning-overlay"
                className="pointer-events-none absolute inset-0 overflow-hidden bg-[#111114]/55 backdrop-blur-[1px]"
              >
                {!prefersReducedMotion && (
                  <>
                    <motion.div
                      initial={{ top: '-12%' }}
                      animate={{ top: ['0%', '100%', '0%'] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-[#FF5A1F]/85 to-transparent"
                    />
                    {BINARY_PARTICLES.map((p) => (
                      <motion.span
                        key={p.id}
                        initial={{
                          y: scanMode === 'hide' ? '105%' : '10%',
                          opacity: 0,
                        }}
                        animate={{
                          y: scanMode === 'hide' ? '15%' : '-10%',
                          opacity: [0, 1, 0],
                        }}
                        transition={{
                          duration: p.duration,
                          delay: p.delay,
                          repeat: Infinity,
                          ease: 'easeOut',
                        }}
                        style={{ left: p.left }}
                        className="font-mono-code absolute text-xs font-bold text-white"
                      >
                        {p.bit}
                      </motion.span>
                    ))}
                  </>
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="border border-white/25 bg-[#111114]/90 px-4 py-2 font-mono-code text-xs font-medium text-white backdrop-blur-md">
                    {scanMode === 'hide' ? 'Embedding LSB bits…' : 'Scanning pixel LSBs…'}
                  </span>
                </div>
              </div>
            )}

            {!isScanning && (
              <div className="absolute top-5 right-5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 bg-[#111114]/90 px-3 py-1.5 font-mono-code text-xs font-semibold text-white backdrop-blur-md transition-colors hover:bg-[#FF5A1F] focus-visible:outline-2 focus-visible:outline-white whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Replace</span>
                </button>
                <button
                  type="button"
                  onClick={onClear}
                  aria-label="Remove selected image"
                  className="inline-flex h-9 w-9 items-center justify-center bg-[#111114]/90 text-white backdrop-blur-md transition-colors hover:bg-[#FF5A1F] focus-visible:outline-2 focus-visible:outline-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </motion.div>

          <div className="relative flex flex-wrap items-center justify-between gap-2 border-t border-[#C5C5CC] dark:border-white/12 bg-white dark:bg-[#141419] px-4 py-2.5 text-xs text-[#5A5A62] dark:text-[#A1A1AA]">
            <span
              className="truncate max-w-[180px] font-semibold text-[#111114] dark:text-[#F4F4F6]"
              title={image.name}
            >
              {image.name}
            </span>
            <div className="flex items-center gap-2 font-mono-code">
              <span>
                {image.width}×{image.height}
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatBytes(image.capacityBytes)} capacity</span>
            </div>
          </div>
        </div>
      )}

      {showSamples && onSampleSelected && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#5A5A62] dark:text-[#A1A1AA]">
          <span className="font-mono-code font-medium">Sample stock:</span>
          {SAMPLE_PHOTOS.map((sample) => (
            <button
              key={sample.id}
              type="button"
              disabled={isLoading || isScanning}
              onClick={() => onSampleSelected(sample)}
              className="min-h-[34px] border border-[#C5C5CC] dark:border-white/15 bg-white dark:bg-white/[0.05] px-3 py-1 font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#111114] hover:bg-[#111114] hover:text-white dark:hover:border-white dark:hover:bg-white dark:hover:text-[#111114] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {sample.label}
            </button>
          ))}
        </div>
      )}

      {image?.hasTransparency && (
        <p className="text-xs text-[#5A5A62] dark:text-[#A1A1AA]">
          Transparent pixels were flattened onto a solid backdrop so PNG alpha premultiplication
          cannot alter hidden bits.
        </p>
      )}
      {image?.isLargeImage && (
        <p className="text-xs text-[#5A5A62] dark:text-[#A1A1AA]">
          High-resolution photo ({(image.pixelCount / 1_000_000).toFixed(1)} MP) — PNG export may
          take a second.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 border border-[#FF5A1F] bg-[#FF5A1F]/10 px-3.5 py-2.5 text-xs font-medium text-[#B83206] dark:text-[#FF8254]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A1F]" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

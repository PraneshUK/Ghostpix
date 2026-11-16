import React, { useRef, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';

interface BeforeAfterSliderProps {
  originalUrl: string;
  encodedUrl: string;
  altOriginal?: string;
  altEncoded?: string;
}

export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  originalUrl,
  encodedUrl,
  altOriginal = 'Original cover image',
  altEncoded = 'Ghostpix PNG with hidden message',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const updateFromClientX = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, next)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    updateFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    updateFromClientX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setIsDragging(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPosition((p) => Math.max(0, p - 4));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPosition((p) => Math.min(100, p + 4));
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5A5A62] dark:text-[#A1A1AA]">
        <span>Original (left) · Max pixel shift ±1/255</span>
        <div className="inline-flex items-center gap-1 font-mono-code">
          {[
            { label: '0%', val: 0 },
            { label: '50%', val: 50 },
            { label: '100%', val: 100 },
          ].map((preset) => {
            const isNear = Math.abs(position - preset.val) < 3;
            return (
              <button
                key={preset.val}
                type="button"
                onClick={() => setPosition(preset.val)}
                className={`border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                  isNear
                    ? 'border-[#FF5A1F] bg-[#FF5A1F] text-white'
                    : 'border-[#C5C5CC] dark:border-white/15 bg-white dark:bg-white/[0.05] text-[#111114] dark:text-[#F4F4F6] hover:border-[#FF5A1F]'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          <span className="ml-1.5 font-medium text-[#111114] dark:text-[#F4F4F6]">
            {Math.round(position)}%
          </span>
        </div>
        <span>Hidden-message PNG (right)</span>
      </div>

      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative aspect-[4/3] w-full select-none overflow-hidden border border-[#C5C5CC] dark:border-white/15 bg-[#111114] touch-none cursor-ew-resize"
        data-testid="before-after-slider"
      >
        <img
          src={encodedUrl}
          alt={altEncoded}
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain pointer-events-none"
          referrerPolicy="no-referrer"
        />

        <div
          className="absolute inset-0 overflow-hidden pointer-events-none"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <img
            src={originalUrl}
            alt={altOriginal}
            draggable={false}
            className="h-full w-full object-contain"
            referrerPolicy="no-referrer"
          />
        </div>

        <span className="pointer-events-none absolute top-3 left-3 bg-white px-2.5 py-1 font-mono-code text-[11px] font-semibold text-[#111114] border border-[#C5C5CC]">
          Original
        </span>
        <span className="pointer-events-none absolute top-3 right-3 bg-[#FF5A1F] px-2.5 py-1 font-mono-code text-[11px] font-semibold text-white">
          Ghostpix PNG
        </span>

        {/* Sharp Signal Orange divider line + square obsidian handle */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Compare original and hidden-message image"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          onKeyDown={handleKeyDown}
          style={{ left: `${position}%` }}
          className="absolute inset-y-0 -translate-x-1/2 flex items-center justify-center focus-visible:outline-none"
        >
          <div className="h-full w-0.5 bg-[#FF5A1F]" />
          <div
            className={`absolute flex h-10 w-10 items-center justify-center border bg-[#111114] text-white shadow-md transition-transform ${
              isDragging ? 'scale-110 border-[#FF5A1F]' : 'border-white/25'
            }`}
          >
            <MoveHorizontal className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
};

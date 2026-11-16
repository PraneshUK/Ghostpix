import React, { useMemo, useState } from 'react';
import { Grid } from 'lucide-react';
import { inspectPixelGrid, PixelCellInspection } from '../utils/steganography';

interface BitViewInspectorProps {
  originalPixels: Uint8ClampedArray;
  encodedPixels: Uint8ClampedArray;
  width: number;
  height: number;
}

export const BitViewInspector: React.FC<BitViewInspectorProps> = ({
  originalPixels,
  encodedPixels,
  width,
  height,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [regionOffset, setRegionOffset] = useState<'header' | 'payload'>('header');
  const [selectedCell, setSelectedCell] = useState<PixelCellInspection | null>(null);

  const startX = regionOffset === 'payload' && width > 32 ? 24 : 0;

  const cells = useMemo(() => {
    if (!isOpen) return [];
    return inspectPixelGrid(originalPixels, encodedPixels, width, height, startX, 0, 8);
  }, [isOpen, originalPixels, encodedPixels, width, height, startX]);

  const activeCell = selectedCell ?? cells[0] ?? null;
  const changedInGrid = cells.filter((c) => c.rChanged || c.gChanged || c.bChanged).length;

  return (
    <div className="border border-[#C5C5CC] dark:border-white/15 bg-[#F4F4F6]/85 dark:bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-bold text-[#111114] dark:text-[#F4F4F6]">Bit view inspector</p>
          <p className="text-xs text-[#5A5A62] dark:text-[#A1A1AA]">
            Inspect 8×8 pixel blocks to see why ±1 LSB changes are invisible to the eye.
          </p>
        </div>
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`chamfer-btn-sm inline-flex min-h-[40px] items-center gap-2 border px-4 py-2 font-mono-code text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#FF5A1F] ${
            isOpen
              ? 'border-[#FF5A1F] bg-[#FF5A1F] text-white'
              : 'border-[#C5C5CC] dark:border-white/20 bg-white dark:bg-[#18181F] text-[#111114] dark:text-[#F4F4F6] hover:border-[#111114] hover:bg-[#111114] hover:text-white dark:hover:border-white dark:hover:bg-white dark:hover:text-[#111114]'
          }`}
        >
          <Grid className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{isOpen ? 'Hide Bit View' : 'Bit view'}</span>
        </button>
      </div>

      {isOpen && (
        <div className="mt-4 grid gap-5 border-t border-[#C5C5CC] dark:border-white/12 pt-4 md:grid-cols-[auto_1fr] md:items-start">
          <div className="space-y-2.5">
            {width > 32 && (
              <div className="inline-flex border border-[#C5C5CC] dark:border-white/15 bg-white dark:bg-[#0B0B0F] p-0.5 font-mono-code text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setRegionOffset('header');
                    setSelectedCell(null);
                  }}
                  className={`px-2.5 py-1 font-semibold transition-colors ${
                    regionOffset === 'header'
                      ? 'bg-[#111114] dark:bg-[#F4F4F6] text-white dark:text-[#111114]'
                      : 'text-[#5A5A62] dark:text-[#A1A1AA] hover:text-[#111114] dark:hover:text-white'
                  }`}
                >
                  GPX1 Header (0,0)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRegionOffset('payload');
                    setSelectedCell(null);
                  }}
                  className={`px-2.5 py-1 font-semibold transition-colors ${
                    regionOffset === 'payload'
                      ? 'bg-[#111114] dark:bg-[#F4F4F6] text-white dark:text-[#111114]'
                      : 'text-[#5A5A62] dark:text-[#A1A1AA] hover:text-[#111114] dark:hover:text-white'
                  }`}
                >
                  Payload (+24,0)
                </button>
              </div>
            )}

            <div
              className="grid grid-cols-8 gap-1 border border-[#C5C5CC] dark:border-white/15 bg-white dark:bg-[#0B0B0F] p-2 w-fit"
              role="grid"
              aria-label="Magnified 8 by 8 pixel grid with changed least significant bits highlighted"
            >
              {cells.map((cell) => {
                const hasFlip = cell.rChanged || cell.gChanged || cell.bChanged;
                const isSelected = activeCell?.x === cell.x && activeCell?.y === cell.y;
                return (
                  <button
                    key={`${cell.x}-${cell.y}`}
                    type="button"
                    onClick={() => setSelectedCell(cell)}
                    title={`Pixel (${cell.x}, ${cell.y}) — LSBs ${cell.origLsbs} → ${cell.modLsbs}`}
                    aria-label={`Pixel ${cell.x},${cell.y}, ${hasFlip ? 'LSB flipped' : 'LSB unchanged'}`}
                    className={`relative h-7 w-7 sm:h-8 sm:w-8 transition-transform focus-visible:outline-2 focus-visible:outline-[#FF5A1F] ${
                      isSelected
                        ? 'scale-110 ring-2 ring-[#111114] dark:ring-white z-10'
                        : 'hover:scale-105'
                    } ${hasFlip ? 'ring-2 ring-[#FF5A1F]' : 'ring-1 ring-[#111114]/15 dark:ring-white/15'}`}
                    style={{
                      backgroundColor: `rgb(${cell.modR}, ${cell.modG}, ${cell.modB})`,
                    }}
                  >
                    {hasFlip && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-[#FF5A1F]"
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[#5A5A62] dark:text-[#A1A1AA]">
              <span className="font-mono-code font-semibold text-[#FF5A1F] dark:text-[#FF8254]">
                {changedInGrid}/64
              </span>{' '}
              pixels flipped at least 1 LSB (highlighted in orange).
            </p>
          </div>

          {activeCell && (
            <div className="space-y-3 border border-[#C5C5CC] dark:border-white/12 bg-white dark:bg-[#0B0B0F]/85 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                  Pixel ({activeCell.x}, {activeCell.y})
                </span>
                <span className="text-xs text-[#5A5A62] dark:text-[#A1A1AA]">
                  Delta:{' '}
                  <span className="font-mono-code font-medium text-[#111114] dark:text-[#F4F4F6]">
                    ΔR={activeCell.modR - activeCell.origR} · ΔG={activeCell.modG - activeCell.origG}{' '}
                    · ΔB={activeCell.modB - activeCell.origB}
                  </span>
                </span>
              </div>

              <div className="space-y-2 font-mono-code text-xs">
                {[
                  {
                    label: 'R',
                    orig: activeCell.origR,
                    mod: activeCell.modR,
                    changed: activeCell.rChanged,
                  },
                  {
                    label: 'G',
                    orig: activeCell.origG,
                    mod: activeCell.modG,
                    changed: activeCell.gChanged,
                  },
                  {
                    label: 'B',
                    orig: activeCell.origB,
                    mod: activeCell.modB,
                    changed: activeCell.bChanged,
                  },
                ].map((ch) => {
                  const origBin = ch.orig.toString(2).padStart(8, '0');
                  const modBin = ch.mod.toString(2).padStart(8, '0');
                  return (
                    <div
                      key={ch.label}
                      className="flex flex-wrap items-center justify-between gap-2 border border-[#C5C5CC]/70 dark:border-white/10 bg-[#F4F4F6] dark:bg-white/[0.04] px-3 py-1.5"
                    >
                      <span className="text-[#5A5A62] dark:text-[#A1A1AA]">
                        {ch.label}: {String(ch.orig).padStart(3, ' ')} →{' '}
                        <span className="font-semibold text-[#111114] dark:text-[#F4F4F6]">
                          {String(ch.mod).padStart(3, ' ')}
                        </span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[#5A5A62] dark:text-[#A1A1AA]">
                          {origBin.slice(0, 7)}
                          <span className="font-semibold text-[#111114] dark:text-[#F4F4F6]">
                            {origBin[7]}
                          </span>
                        </span>
                        <span className="text-[#5A5A62] dark:text-[#A1A1AA]">→</span>
                        <span>
                          <span className="text-[#5A5A62] dark:text-[#A1A1AA]">
                            {modBin.slice(0, 7)}
                          </span>
                          <span
                            className={
                              ch.changed
                                ? 'font-bold text-[#FF5A1F] dark:text-[#FF8254] underline decoration-[#FF5A1F]'
                                : 'font-semibold text-[#111114] dark:text-[#F4F4F6]'
                            }
                          >
                            {modBin[7]}
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs leading-relaxed text-[#5A5A62] dark:text-[#A1A1AA]">
                Each color channel runs from <span className="font-mono-code">0</span> to{' '}
                <span className="font-mono-code">255</span>. Changing only the last bit shifts
                brightness by at most{' '}
                <span className="font-mono-code text-[#111114] dark:text-[#F4F4F6]">1/255</span>{' '}
                (0.39%), which the human eye cannot perceive.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

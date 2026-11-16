import React from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import type { AppPage } from './TopBar';

const SCALE_TICKS = Array.from({ length: 21 }, (_, i) => i);

const STOPS_BY_PAGE: Record<AppPage, Array<{ id: string; code: string; label: string }>> = {
  overview: [
    { id: 'top', code: '00', label: 'Intro' },
    { id: 'vaults', code: '01', label: 'Vaults' },
    { id: 'how-to-use', code: '02', label: 'How to use' },
    { id: 'how-it-works', code: '03', label: 'Tech specs' },
  ],
  hide: [
    { id: 'top', code: '00', label: 'Header' },
    { id: 'hide-workspace', code: '01', label: 'Hide Vault' },
  ],
  reveal: [
    { id: 'top', code: '00', label: 'Header' },
    { id: 'reveal-workspace', code: '02', label: 'Reveal' },
  ],
};

interface ScrollScaleRailProps {
  activePage: AppPage;
}

export const ScrollScaleRail: React.FC<ScrollScaleRailProps> = ({ activePage }) => {
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 240,
    damping: 30,
    restDelta: 0.001,
  });

  const tapeY = useTransform(smoothProgress, [0, 1], ['28%', '-58%']);
  const sectionStops = STOPS_BY_PAGE[activePage];

  const scrollToSection = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <>
      {/* Subtle 2px top scroll-scale bar across all viewports */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-0 right-0 left-0 z-50 h-[2px] overflow-hidden bg-transparent"
      >
        <motion.div
          style={{
            scaleX: prefersReducedMotion ? 1 : smoothProgress,
            transformOrigin: 'left center',
          }}
          className="scroll-scale-top h-full w-full bg-[#FF5A1F]"
        />
      </div>

      {/* Fixed right-margin architectural side scale ruler on wide desktop viewports */}
      <aside
        aria-label="Page scroll scale navigation"
        className="fixed top-1/2 right-4 z-30 hidden -translate-y-1/2 min-[1360px]:flex flex-col items-end gap-3"
      >
        <div className="liquid-glass-pill flex flex-col items-end gap-2.5 px-2.5 py-3">
          <span
            aria-hidden="true"
            className="flex h-4 w-4 items-center justify-center border border-[#C5C5CC] dark:border-white/20 font-mono-code text-[9px] text-[#5A5A62] dark:text-[#A1A1AA]"
          >
            ×
          </span>

          {/* Quick section scale jumps */}
          <nav aria-label="Section scale markers" className="flex flex-col items-end gap-1">
            {sectionStops.map((stop) => (
              <button
                key={stop.id}
                type="button"
                onClick={() => scrollToSection(stop.id)}
                title={`Jump to ${stop.label}`}
                aria-label={`Jump to ${stop.label}`}
                className="group flex items-center gap-1.5 px-1 py-0.5 font-mono-code text-[10px] font-semibold tracking-wider text-[#5A5A62] dark:text-[#A1A1AA] transition-colors hover:text-[#FF5A1F] dark:hover:text-[#FF8254] focus-visible:outline-2 focus-visible:outline-[#FF5A1F]"
              >
                <span className="transition-transform duration-200 group-hover:-translate-x-0.5">
                  {stop.code}
                </span>
                <span className="h-[1.5px] w-2.5 bg-[#111114]/30 dark:bg-white/30 transition-all duration-200 group-hover:w-4 group-hover:bg-[#FF5A1F]" />
              </button>
            ))}
          </nav>

          {/* Calibrated scrolling side scale tape + vertical progress bar */}
          <div className="relative flex h-28 w-10 items-center justify-end overflow-hidden border-t border-[#C5C5CC] dark:border-white/12 pt-2">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-1.5 left-0 z-10 h-[1.5px] -translate-y-1/2 bg-[#FF5A1F]"
            />

            <motion.div
              aria-hidden="true"
              style={{ y: prefersReducedMotion ? '0%' : tapeY }}
              className="mr-2.5 flex flex-col items-end gap-1.5"
            >
              {SCALE_TICKS.map((tick) => {
                const isMajor = tick % 5 === 0;
                return (
                  <div key={tick} className="flex items-center gap-1">
                    {isMajor && (
                      <span className="font-mono-code text-[8px] leading-none text-[#5A5A62]/85 dark:text-[#A1A1AA]/85">
                        {String(tick * 5).padStart(2, '0')}
                      </span>
                    )}
                    <span
                      className={
                        isMajor
                          ? 'h-[1.5px] w-3 bg-[#111114]/55 dark:bg-white/55'
                          : 'h-px w-1.5 bg-[#111114]/25 dark:bg-white/25'
                      }
                    />
                  </div>
                );
              })}
            </motion.div>

            <div
              aria-hidden="true"
              className="relative h-full w-[2px] overflow-hidden bg-[#111114]/15 dark:bg-white/15"
            >
              <motion.div
                style={{
                  scaleY: prefersReducedMotion ? 1 : smoothProgress,
                  transformOrigin: 'top center',
                }}
                className="h-full w-full bg-[#FF5A1F]"
              />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

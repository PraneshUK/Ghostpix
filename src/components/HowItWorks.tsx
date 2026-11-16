import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Binary, FileCheck2, ShieldCheck } from 'lucide-react';
import { LiquidGlassPanel } from './LiquidGlassPanel';
import { ScrollScaleSection } from './ScrollScaleSection';

import type { AppPage } from './TopBar';

const STEPS: Array<{
  number: string;
  tag: string;
  targetPage: AppPage;
  metricA: { label: string; value: string };
  metricB: { label: string; value: string };
  metricC: { label: string; value: string };
  metricD: { label: string; value: string };
  icon: typeof ShieldCheck;
  title: string;
  description: string;
}> = [
  {
    number: '01',
    tag: 'Encryption',
    targetPage: 'hide',
    metricA: { label: 'Cipher', value: 'AES-256-GCM' },
    metricB: { label: 'Key Stretch', value: '600k PBKDF2' },
    metricC: { label: 'Salt + IV', value: '28 Bytes' },
    metricD: { label: 'UTF-8', value: 'All Emoji' },
    icon: ShieldCheck,
    title: 'Hardened AES-256-GCM vault lock',
    description:
      'Encodes any language or emoji as UTF-8 bytes, encrypted with an authenticated 256-bit AES-GCM key derived locally via 600,000 PBKDF2 iterations.',
  },
  {
    number: '02',
    tag: 'Steganography',
    targetPage: 'hide',
    metricA: { label: 'Channels', value: 'R · G · B' },
    metricB: { label: 'Header', value: 'GPX2 (CRC32)' },
    metricC: { label: 'Scattering', value: 'Feistel LSB' },
    metricD: { label: 'Max Shift', value: '1 / 255' },
    icon: Binary,
    title: 'Randomized Feistel LSB scattering',
    description:
      'Writes the versioned GPX2 header and scatters payload bits across carrier channels using a password-keyed Feistel permutation — imperceptible to the human eye.',
  },
  {
    number: '03',
    tag: 'Delivery',
    targetPage: 'reveal',
    metricA: { label: 'Output', value: 'PNG' },
    metricB: { label: 'Compression', value: 'Lossless' },
    metricC: { label: 'Share Mode', value: 'File / Doc' },
    metricD: { label: 'Server', value: '0 Uploads' },
    icon: FileCheck2,
    title: 'Lossless PNG keeps bits intact',
    description:
      'PNG preserves every pixel bit verbatim. Always send Ghostpix PNGs as a File or Document so chat apps do not recompress.',
  },
];

interface HowItWorksProps {
  onOpenPage: (page: AppPage) => void;
}

export const HowItWorks: React.FC<HowItWorksProps> = ({ onOpenPage }) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="mx-auto max-w-6xl px-4 pt-2 pb-10 sm:px-6 lg:px-8"
    >
      <ScrollScaleSection minScale={0.95}>
        <LiquidGlassPanel delay={0.08} className="p-5 sm:p-7 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#C5C5CC] dark:border-white/12 pb-5">
            <div className="max-w-2xl space-y-1.5">
              <h2
                id="how-it-works-heading"
                className="font-display text-2xl font-bold tracking-tight text-[#111114] dark:text-[#F4F4F6] sm:text-3xl"
              >
                How it works
              </h2>
              <p className="text-sm leading-relaxed text-[#5A5A62] dark:text-[#A1A1AA]">
                100% client-side HTML Canvas steganography. Your photos and messages never leave your
                device.
              </p>
            </div>
            <span className="font-condensed text-4xl font-bold leading-none text-[#111114] dark:text-[#F4F4F6]">
              003
            </span>
          </div>

          {/* 3-card architectural grid */}
          <div className="grid gap-5 md:grid-cols-3">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.number}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : { duration: 0.38, delay: idx * 0.07, ease: [0.16, 1, 0.3, 1] }
                  }
                  className="editorial-step-card group flex flex-col border border-[#C5C5CC] dark:border-white/15 bg-white dark:bg-[#141419]"
                >
                  {/* Card Top Bar Tag + Icon */}
                  <div className="flex items-center justify-between border-b border-[#C5C5CC] dark:border-white/12 px-4 py-2 bg-[#F5F5F7] dark:bg-white/[0.03]">
                    <span className="font-mono-code text-[11px] font-medium text-[#5A5A62] dark:text-[#A1A1AA]">
                      {step.number} · {step.tag}
                    </span>
                    <Icon
                      className="h-3.5 w-3.5 text-[#111114] dark:text-[#F4F4F6] transition-transform duration-300 group-hover:scale-110 group-hover:text-[#FF5A1F]"
                      aria-hidden="true"
                    />
                  </div>

                  {/* Card Center Headline & Summary */}
                  <div className="flex-1 px-4 py-5 space-y-2 border-b border-[#C5C5CC] dark:border-white/12">
                    <h3 className="font-display text-base font-bold tracking-tight text-[#111114] dark:text-[#F4F4F6]">
                      {step.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-[#5A5A62] dark:text-[#A1A1AA]">
                      {step.description}
                    </p>
                  </div>

                  {/* Card Bottom 2x2 Metric Grid + Right Arrow Box (Reference Signature) */}
                  <div className="grid grid-cols-[1fr_44px]">
                    <div className="grid grid-cols-2 divide-x divide-y divide-[#C5C5CC] dark:divide-white/12">
                      <div className="px-3 py-2">
                        <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                          {step.metricA.value}
                        </p>
                        <p className="text-[10px] text-[#5A5A62] dark:text-[#A1A1AA]">
                          {step.metricA.label}
                        </p>
                      </div>
                      <div className="px-3 py-2 border-t-0">
                        <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                          {step.metricB.value}
                        </p>
                        <p className="text-[10px] text-[#5A5A62] dark:text-[#A1A1AA]">
                          {step.metricB.label}
                        </p>
                      </div>
                      <div className="px-3 py-2">
                        <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                          {step.metricC.value}
                        </p>
                        <p className="text-[10px] text-[#5A5A62] dark:text-[#A1A1AA]">
                          {step.metricC.label}
                        </p>
                      </div>
                      <div className="px-3 py-2">
                        <p className="font-mono-code text-xs font-semibold text-[#FF5A1F]">
                          {step.metricD.value}
                        </p>
                        <p className="text-[10px] text-[#5A5A62] dark:text-[#A1A1AA]">
                          {step.metricD.label}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenPage(step.targetPage)}
                      aria-label={`Open ${step.targetPage === 'hide' ? 'Hide Vault' : 'Reveal Inspector'} for step ${step.number}`}
                      className="flex items-center justify-center border-l border-[#C5C5CC] dark:border-white/12 text-[#111114] dark:text-[#F4F4F6] transition-colors hover:bg-[#FF5A1F] hover:text-white focus-visible:outline-2 focus-visible:outline-[#FF5A1F]"
                    >
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </LiquidGlassPanel>
      </ScrollScaleSection>
    </section>
  );
};

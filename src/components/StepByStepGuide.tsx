import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileWarning,
  ImagePlus,
  KeyRound,
  Lock,
  MessageSquareText,
  QrCode,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { LiquidGlassPanel } from './LiquidGlassPanel';
import { ScrollScaleSection } from './ScrollScaleSection';
import type { AppPage } from './TopBar';

type GuideTab = 'hide' | 'reveal';

interface GuideStep {
  step: string;
  title: string;
  plainSummary: string;
  tip: string;
  icon: typeof ImagePlus;
}

const HIDE_STEPS: GuideStep[] = [
  {
    step: '01',
    title: 'Pick any cover photo',
    plainSummary:
      'Open Hide Vault and drop or choose any photo from your phone or computer (PNG, JPG, or WebP). You can also click a built-in Sample photo to practice right away.',
    tip: 'Bigger photos hold longer messages. A normal photo can hold tens of thousands of letters.',
    icon: ImagePlus,
  },
  {
    step: '02',
    title: 'Type your secret message',
    plainSummary:
      'Write anything you want to hide in the Message box — plain text, links, numbers, Tamil, Japanese, or emoji. Watch the Capacity meter to make sure it fits.',
    tip: 'Your text stays 100% inside your browser and is never sent to any website or server.',
    icon: MessageSquareText,
  },
  {
    step: '03',
    title: 'Add an optional QR code or password',
    plainSummary:
      'Want extra protection? Type a Password so nobody can read the message without your key. You can also switch on "Encode message as QR code image" to hide a scannable QR backup inside.',
    tip: 'If you set a password, remember to tell your friend the password separately (for example, in person or a different chat).',
    icon: QrCode,
  },
  {
    step: '04',
    title: 'Hide & download your PNG',
    plainSummary:
      'Click "Hide Message", wait a moment while Ghostpix weaves the secret into tiny invisible pixel bits, and click "Download PNG". The new picture looks completely normal.',
    tip: 'You can click "Verify in Reveal" right away to test unlocking your image before sending it.',
    icon: Download,
  },
  {
    step: '05',
    title: 'Send as a File or Document',
    plainSummary:
      'When sharing on WhatsApp, Telegram, or Email, choose "Document" or "File" — never normal Photo mode. Photo mode shrinks pictures and wipes out the hidden message.',
    tip: 'AirDrop, Google Drive, email attachments, and WhatsApp Document mode keep every pixel intact.',
    icon: Send,
  },
];

const REVEAL_STEPS: GuideStep[] = [
  {
    step: '01',
    title: 'Save the received PNG file',
    plainSummary:
      'Download the exact PNG file your sender shared with you as a Document or File attachment. Do not take a screenshot of it.',
    tip: 'Make sure the file name ends in .png, not .jpg, because JPEG recompression erases hidden pixel data.',
    icon: Download,
  },
  {
    step: '02',
    title: 'Drop the PNG into Reveal Inspector',
    plainSummary:
      'Open Reveal Inspector and drop or select the saved PNG. Ghostpix scans the opening pixels and shows a green "Ghostpix Format Detected" status if a secret is inside.',
    tip: 'The banner automatically tells you whether the secret is plain text, a QR code, or locked with a password.',
    icon: Eye,
  },
  {
    step: '03',
    title: 'Enter the password (only if locked)',
    plainSummary:
      'If the green banner says "AES-GCM Locked", type the password from the sender into the Decryption password box. Leave it empty if no password was used.',
    tip: 'If the wrong password is entered, Ghostpix blocks access and warns you right away.',
    icon: Lock,
  },
  {
    step: '04',
    title: 'Click "Reveal Message" & copy',
    plainSummary:
      'Press "Reveal Message" to unlock and display the hidden text on screen. If a QR code was embedded, both the scannable QR image and decoded text appear together.',
    tip: 'Use the Copy button to copy the revealed text, or Download QR PNG to save the recovered QR code.',
    icon: KeyRound,
  },
];

interface StepByStepGuideProps {
  onOpenPage: (page: AppPage) => void;
}

export const StepByStepGuide: React.FC<StepByStepGuideProps> = ({ onOpenPage }) => {
  const prefersReducedMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<GuideTab>('hide');

  const steps = activeTab === 'hide' ? HIDE_STEPS : REVEAL_STEPS;

  return (
    <section
      id="how-to-use"
      aria-labelledby="how-to-use-heading"
      className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8"
    >
      <ScrollScaleSection minScale={0.96}>
        <LiquidGlassPanel className="p-5 sm:p-7 space-y-6">
          {/* Header + Interactive Role Toggle */}
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#C5C5CC] dark:border-white/12 pb-5">
            <div className="max-w-2xl space-y-1.5">
              <p className="font-mono-code text-xs font-medium text-[#FF5A1F]">
                Beginner-friendly walkthrough
              </p>
              <h2
                id="how-to-use-heading"
                className="font-display text-2xl font-bold tracking-tight text-[#111114] dark:text-[#F4F4F6] sm:text-3xl"
                style={{ textWrap: 'balance' }}
              >
                Step-by-step: How anyone can use Ghostpix
              </h2>
              <p className="text-sm leading-relaxed text-[#5A5A62] dark:text-[#A1A1AA]">
                Follow these plain-language steps whether you are hiding a secret inside a photo
                for the first time or unlocking an image someone sent you.
              </p>
            </div>

            {/* Functional Segmented Tab Switcher */}
            <div
              role="tablist"
              aria-label="Choose walkthrough mode"
              className="grid w-full sm:w-auto sm:inline-flex sm:grid-cols-2 border border-[#C5C5CC] dark:border-white/20 bg-[#F5F5F7] dark:bg-[#0B0B0F] p-1 gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'hide'}
                onClick={() => setActiveTab('hide')}
                className={`inline-flex min-h-[40px] items-center justify-center gap-2 px-4 py-2 font-mono-code text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#FF5A1F] ${
                  activeTab === 'hide'
                    ? 'bg-[#FF5A1F] text-white'
                    : 'bg-transparent text-[#5A5A62] dark:text-[#A1A1AA] hover:text-[#111114] dark:hover:text-white'
                }`}
              >
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                <span>I want to Hide a Secret</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'reveal'}
                onClick={() => setActiveTab('reveal')}
                className={`inline-flex min-h-[40px] items-center justify-center gap-2 px-4 py-2 font-mono-code text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#FF5A1F] ${
                  activeTab === 'reveal'
                    ? 'bg-[#111114] dark:bg-[#F4F4F6] text-white dark:text-[#111114]'
                    : 'bg-transparent text-[#5A5A62] dark:text-[#A1A1AA] hover:text-[#111114] dark:hover:text-white'
                }`}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span>I received a PNG to Reveal</span>
              </button>
            </div>
          </div>

          {/* Numbered Step-by-Step List */}
          <ol
            aria-label={
              activeTab === 'hide'
                ? 'Steps to hide a secret message'
                : 'Steps to reveal a secret message'
            }
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
          >
            {steps.map((item, idx) => {
              const Icon = item.icon;
              return (
                <motion.li
                  key={`${activeTab}-${item.step}`}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : { duration: 0.25, delay: idx * 0.04, ease: [0.16, 1, 0.3, 1] }
                  }
                  className="flex flex-col justify-between border border-[#C5C5CC] dark:border-white/15 bg-white dark:bg-[#141419]"
                >
                  <div className="space-y-3 p-5">
                    <div className="flex items-center justify-between gap-3 border-b border-[#C5C5CC] dark:border-white/12 pb-3">
                      <span className="font-condensed text-2xl font-bold leading-none text-[#FF5A1F]">
                        Step {item.step}
                      </span>
                      <Icon
                        className="h-4 w-4 text-[#111114] dark:text-[#F4F4F6]"
                        aria-hidden="true"
                      />
                    </div>

                    <h3 className="font-display text-base font-bold tracking-tight text-[#111114] dark:text-[#F4F4F6]">
                      {item.title}
                    </h3>

                    <p className="text-xs sm:text-sm leading-relaxed text-[#5A5A62] dark:text-[#A1A1AA]">
                      {item.plainSummary}
                    </p>
                  </div>

                  <div className="border-t border-[#C5C5CC] dark:border-white/12 bg-[#F5F5F7] dark:bg-white/[0.03] px-5 py-3">
                    <p className="text-[11px] leading-relaxed text-[#111114] dark:text-[#E4E4E7]">
                      <span className="font-mono-code font-semibold text-[#FF5A1F]">Tip:</span>{' '}
                      {item.tip}
                    </p>
                  </div>
                </motion.li>
              );
            })}

            {/* Final Action Card in Grid */}
            <li
              className={`flex flex-col justify-between border border-[#111114] dark:border-white/25 bg-[#111114] dark:bg-[#F4F4F6] p-5 text-white dark:text-[#111114] ${
                activeTab === 'reveal' ? 'md:col-span-2 lg:col-span-2' : ''
              }`}
            >
              <div className="space-y-2.5">
                <p className="font-mono-code text-xs font-semibold text-[#FF5A1F]">
                  Ready to try it?
                </p>
                <h3 className="font-display text-lg font-bold tracking-tight">
                  {activeTab === 'hide'
                    ? 'Practice with a free sample photo'
                    : 'Unlock a Ghostpix PNG right now'}
                </h3>
                <p className="text-xs sm:text-sm leading-relaxed text-white/80 dark:text-[#111114]/80">
                  {activeTab === 'hide'
                    ? 'You do not even need to upload your own picture first — pick "Aurora Fjord" or "Glass Prisms" inside Hide Vault and run a full test.'
                    : 'Drop any PNG shared with you into Reveal Inspector to check for a Ghostpix message in under a second.'}
                </p>
              </div>

              <div className="pt-5">
                <button
                  type="button"
                  onClick={() => onOpenPage(activeTab === 'hide' ? 'hide' : 'reveal')}
                  className="chamfer-btn-sm btn-hover-glint inline-flex w-full min-h-[44px] items-center justify-between bg-[#FF5A1F] px-4 py-2.5 font-mono-code text-xs font-semibold tracking-wide text-white transition-colors hover:bg-white hover:text-[#111114] dark:hover:bg-[#111114] dark:hover:text-white whitespace-nowrap shrink-0"
                >
                  <span>
                    {activeTab === 'hide' ? 'Open Hide Vault now' : 'Open Reveal Inspector now'}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              </div>
            </li>
          </ol>

          {/* Everyday Golden Rules Strip (Do / Don't / Privacy) */}
          <div className="grid gap-4 border-t border-[#C5C5CC] dark:border-white/12 pt-5 md:grid-cols-3">
            <div className="flex items-start gap-3 border border-[#C5C5CC] dark:border-white/12 bg-white/80 dark:bg-white/[0.02] p-4">
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-[#15803D] dark:text-[#4ADE80]"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                  DO: Share as File or Document
                </p>
                <p className="text-xs leading-relaxed text-[#5A5A62] dark:text-[#A1A1AA]">
                  Send the downloaded <span className="font-mono-code">.png</span> as an email
                  attachment, WhatsApp Document, Telegram File, or USB/Drive file.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border border-[#C5C5CC] dark:border-white/12 bg-white/80 dark:bg-white/[0.02] p-4">
              <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A1F]" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                  DON&apos;T: Send as Photo or Screenshot
                </p>
                <p className="text-xs leading-relaxed text-[#5A5A62] dark:text-[#A1A1AA]">
                  Social apps and screenshots re-encode pixels and shrink images, which permanently
                  destroys the hidden message.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border border-[#C5C5CC] dark:border-white/12 bg-white/80 dark:bg-white/[0.02] p-4">
              <ShieldCheck
                className="mt-0.5 h-4 w-4 shrink-0 text-[#111114] dark:text-[#F4F4F6]"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                  PRIVATE: 100% On Your Device
                </p>
                <p className="text-xs leading-relaxed text-[#5A5A62] dark:text-[#A1A1AA]">
                  Everything runs inside your own browser. No photos, passwords, or secrets are ever
                  uploaded to any server.
                </p>
              </div>
            </div>
          </div>
        </LiquidGlassPanel>
      </ScrollScaleSection>
    </section>
  );
};

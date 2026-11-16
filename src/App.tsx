import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Moon, Sun } from 'lucide-react';
import { AuroraBackground } from './components/AuroraBackground';
import { AppPage, TopBar } from './components/TopBar';
import { HideWorkspace } from './components/HideWorkspace';
import { RevealWorkspace } from './components/RevealWorkspace';
import { HowItWorks } from './components/HowItWorks';
import { StepByStepGuide } from './components/StepByStepGuide';
import { ScrollScaleRail } from './components/ScrollScaleRail';

type ThemeMode = 'light' | 'dark';

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem('ghostpix-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getPageFromLocation(): AppPage {
  if (typeof window === 'undefined') return 'overview';
  const hash = window.location.hash.toLowerCase();
  if (hash === '#/hide-vault' || hash === '#hide-vault' || hash === '#hide') return 'hide';
  if (hash === '#/reveal-inspector' || hash === '#reveal-inspector' || hash === '#reveal') {
    return 'reveal';
  }
  const params = new URLSearchParams(window.location.search);
  const pageParam = params.get('page');
  if (pageParam === 'hide') return 'hide';
  if (pageParam === 'reveal') return 'reveal';
  return 'overview';
}

function getHashForPage(page: AppPage): string {
  if (page === 'hide') return '#/hide-vault';
  if (page === 'reveal') return '#/reveal-inspector';
  return '#/';
}

export default function App() {
  const prefersReducedMotion = useReducedMotion();
  const [activePage, setActivePage] = useState<AppPage>(getPageFromLocation);
  const [pendingRevealFile, setPendingRevealFile] = useState<File | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const overviewHeroRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark', isDark);
    window.localStorage.setItem('ghostpix-theme', theme);
  }, [theme]);

  useEffect(() => {
    const syncFromLocation = () => {
      setActivePage(getPageFromLocation());
    };
    window.addEventListener('hashchange', syncFromLocation);
    window.addEventListener('popstate', syncFromLocation);
    return () => {
      window.removeEventListener('hashchange', syncFromLocation);
      window.removeEventListener('popstate', syncFromLocation);
    };
  }, []);

  useEffect(() => {
    if (activePage !== 'overview' || prefersReducedMotion) return;
    const container = overviewHeroRef.current;
    if (!container) return;

    const ctx = gsap.context(() => {
      gsap.from('.hero-stagger-cell', {
        y: 12,
        opacity: 0,
        duration: 0.42,
        stagger: 0.055,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
    }, container);

    return () => ctx.revert();
  }, [activePage, prefersReducedMotion]);

  const navigateTo = useCallback(
    (page: AppPage, anchorId?: string) => {
      setActivePage(page);
      const targetHash = getHashForPage(page);
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, '', targetHash);
      }

      if (anchorId) {
        window.setTimeout(() => {
          document
            .getElementById(anchorId)
            ?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        }, 60);
      } else {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      }
    },
    [prefersReducedMotion]
  );

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleSendToReveal = (file: File) => {
    setPendingRevealFile(file);
    navigateTo('reveal');
  };

  const renderThemeButton = () => (
    <motion.button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={theme === 'dark'}
      whileHover={prefersReducedMotion ? undefined : { scale: 1.03 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className="inline-flex min-h-[40px] items-center gap-2 border border-[#C5C5CC] dark:border-white/20 bg-white dark:bg-[#18181F] px-3.5 py-2 font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6] transition-colors hover:border-[#FF5A1F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A1F] whitespace-nowrap shrink-0"
    >
      {theme === 'dark' ? (
        <>
          <Sun className="h-3.5 w-3.5 text-[#FF5A1F]" aria-hidden="true" />
          <span>Light</span>
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5 text-[#111114]" aria-hidden="true" />
          <span>Dark</span>
        </>
      )}
    </motion.button>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div id="top" className="relative min-h-screen flex flex-col pb-24 sm:pb-0">
        <AuroraBackground />
        <ScrollScaleRail activePage={activePage} />
        <TopBar activePage={activePage} onNavigate={navigateTo} />

        <main className="flex-1">
          <AnimatePresence mode="wait">
            {activePage === 'overview' && (
              <motion.div
                key="page-overview"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -10 }}
                transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Exposed Architectural Grid Hero */}
                <section
                  ref={overviewHeroRef}
                  className="mx-auto max-w-6xl px-4 pt-6 pb-6 sm:px-6 lg:px-8"
                >
                  <div className="blueprint-scanline border border-[#C5C5CC] dark:border-white/15 bg-[#F2F2F4]/72 dark:bg-[#121217]/78 backdrop-blur-md">
                    {/* Oversized Modular Display Band: GHOST_PIX */}
                    <div className="grid border-b border-[#C5C5CC] dark:border-white/15 md:grid-cols-2">
                      <div className="hero-stagger-cell px-5 py-5 sm:px-7 sm:py-6 md:border-r border-[#C5C5CC] dark:border-white/15 flex items-center justify-between gap-4">
                        <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold uppercase leading-[0.88] tracking-[-0.03em] text-[#111114] dark:text-[#F4F4F6]">
                          Ghost<span className="text-[#FF5A1F]">_</span>pix
                        </h1>

                        {/* Geometric 4x2 LSB carrier bit matrix accent */}
                        <div
                          aria-hidden="true"
                          className="hidden sm:grid grid-cols-4 gap-1 border border-[#C5C5CC] dark:border-white/15 bg-white/80 dark:bg-[#0B0B0F] p-1.5 shrink-0"
                        >
                          {[1, 0, 1, 1, 0, 1, 0, 1].map((active, i) => (
                            <span
                              key={i}
                              style={{ animationDelay: `${i * 0.22}s` }}
                              className={`bit-matrix-cell h-2.5 w-2.5 ${
                                active
                                  ? 'bg-[#FF5A1F]'
                                  : 'bg-[#111114]/20 dark:bg-white/20'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="hero-stagger-cell px-5 py-4 sm:px-7 sm:py-6 flex flex-col justify-between gap-2 bg-[#F7F7F9]/75 dark:bg-white/[0.02]">
                        <p
                          className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#111114] dark:text-[#F4F4F6]"
                          style={{ textWrap: 'balance' }}
                        >
                          Hide a secret in{' '}
                          <motion.span
                            initial={prefersReducedMotion ? false : { scaleX: 0.9, opacity: 0.85 }}
                            animate={{ scaleX: 1, opacity: 1 }}
                            transition={{ duration: 0.42, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                            style={{ transformOrigin: 'left center' }}
                            className="inline-block bg-[#FF5A1F] px-2 py-0.5 text-white"
                          >
                            plain sight.
                          </motion.span>
                        </p>
                        <p className="text-xs sm:text-sm text-[#5A5A62] dark:text-[#A1A1AA]">
                          Embed private Unicode or AES-GCM encrypted messages inside ordinary
                          photos — 100% locally in HTML Canvas.
                        </p>
                      </div>
                    </div>

                    {/* Lower Control & Architectural Spec Strip */}
                    <div className="hero-stagger-cell grid lg:grid-cols-[0.38fr_1fr]">
                      <div className="flex items-center justify-between gap-4 border-b lg:border-b-0 lg:border-r border-[#C5C5CC] dark:border-white/15 px-5 py-4 sm:px-7">
                        <div className="space-y-0.5">
                          <span className="block font-mono-code text-[11px] font-medium text-[#5A5A62] dark:text-[#A1A1AA]">
                            Vault Modules
                          </span>
                          <span className="block font-condensed text-4xl font-bold leading-none tracking-tight text-[#111114] dark:text-[#F4F4F6]">
                            02
                          </span>
                        </div>
                        {renderThemeButton()}
                      </div>

                      <div className="flex flex-col justify-between">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C5C5CC] dark:border-white/15 px-5 py-3 sm:px-6">
                          <div className="inline-flex flex-wrap items-center gap-2">
                            <motion.button
                              type="button"
                              onClick={() => navigateTo('hide')}
                              whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                              whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                              transition={{ type: 'spring', stiffness: 440, damping: 28 }}
                              className="chamfer-btn-sm btn-hover-glint inline-flex min-h-[38px] items-center gap-2 bg-[#FF5A1F] px-4 py-1.5 font-mono-code text-xs font-semibold tracking-wide text-white transition-colors hover:bg-[#111114] dark:hover:bg-[#F4F4F6] dark:hover:text-[#111114] whitespace-nowrap shrink-0"
                            >
                              <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>01 Open Hide Vault</span>
                            </motion.button>
                            <motion.button
                              type="button"
                              onClick={() => navigateTo('reveal')}
                              whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                              whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                              transition={{ type: 'spring', stiffness: 440, damping: 28 }}
                              className="inline-flex min-h-[38px] items-center gap-2 border border-[#C5C5CC] dark:border-white/15 bg-white/80 dark:bg-white/[0.04] px-4 py-1.5 font-mono-code text-xs font-semibold tracking-wide text-[#111114] dark:text-[#F4F4F6] transition-colors hover:border-[#111114] dark:hover:border-white/40 whitespace-nowrap shrink-0"
                            >
                              <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>02 Open Reveal</span>
                            </motion.button>
                          </div>

                          <span className="font-mono-code text-[11px] font-medium text-[#5A5A62] dark:text-[#A1A1AA]">
                            Zero server uploads · RGB LSB
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 divide-x divide-[#C5C5CC] dark:divide-white/12 bg-white/75 dark:bg-white/[0.02]">
                          <div className="px-4 py-2.5">
                            <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                              RGB LSB
                            </p>
                            <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                              Alpha Skipped
                            </p>
                          </div>
                          <div className="px-4 py-2.5">
                            <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                              AES-GCM
                            </p>
                            <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                              PBKDF2 256-bit
                            </p>
                          </div>
                          <div className="px-4 py-2.5">
                            <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                              UTF-8
                            </p>
                            <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                              Full Unicode
                            </p>
                          </div>
                          <div className="px-4 py-2.5">
                            <p className="font-mono-code text-xs font-semibold text-[#FF5A1F]">
                              PNG
                            </p>
                            <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                              Lossless Export
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Dedicated Vault Launch Cards */}
                <section
                  id="vaults"
                  aria-label="Ghostpix workspaces"
                  className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8"
                >
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Card 01: Open Hide Vault */}
                    <div className="editorial-step-card group flex flex-col border border-[#C5C5CC] dark:border-white/15 bg-white dark:bg-[#141419]">
                      <div className="flex items-center justify-between border-b border-[#C5C5CC] dark:border-white/12 px-5 py-2.5 bg-[#F5F5F7] dark:bg-white/[0.03]">
                        <span className="font-mono-code text-xs font-medium text-[#5A5A62] dark:text-[#A1A1AA]">
                          01 · Embed & Encrypt
                        </span>
                        <span className="font-condensed text-2xl font-bold leading-none text-[#FF5A1F]">
                          001
                        </span>
                      </div>

                      <div className="flex-1 p-5 sm:p-6 space-y-3 border-b border-[#C5C5CC] dark:border-white/12">
                        <h2 className="font-display text-2xl font-bold tracking-tight text-[#111114] dark:text-[#F4F4F6]">
                          Hide Vault
                        </h2>
                        <p className="text-sm leading-relaxed text-[#5A5A62] dark:text-[#A1A1AA]">
                          Upload any PNG, JPG, or WebP cover photo, write any Unicode secret, lock it
                          with an optional AES-GCM password, compare pixels, and export a lossless
                          PNG.
                        </p>
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => navigateTo('hide')}
                            className="chamfer-btn-sm btn-hover-glint inline-flex min-h-[44px] items-center gap-2.5 bg-[#FF5A1F] px-5 py-2.5 font-mono-code text-xs font-semibold tracking-wider text-white transition-colors hover:bg-[#111114] dark:hover:bg-[#F4F4F6] dark:hover:text-[#111114]"
                          >
                            <span>OPEN HIDE VAULT</span>
                            <ArrowRight
                              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 divide-x divide-[#C5C5CC] dark:divide-white/12">
                        <div className="px-4 py-3">
                          <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                            RGB Channels
                          </p>
                          <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                            8×8 Bit Inspector Included
                          </p>
                        </div>
                        <div className="px-4 py-3">
                          <p className="font-mono-code text-xs font-semibold text-[#FF5A1F]">
                            Before / After
                          </p>
                          <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                            Live Comparison Slider
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Card 02: Open Reveal Inspector */}
                    <div className="editorial-step-card group flex flex-col border border-[#C5C5CC] dark:border-white/15 bg-white dark:bg-[#141419]">
                      <div className="flex items-center justify-between border-b border-[#C5C5CC] dark:border-white/12 px-5 py-2.5 bg-[#F5F5F7] dark:bg-white/[0.03]">
                        <span className="font-mono-code text-xs font-medium text-[#5A5A62] dark:text-[#A1A1AA]">
                          02 · Extract & Decrypt
                        </span>
                        <span className="font-condensed text-2xl font-bold leading-none text-[#111114] dark:text-[#F4F4F6]">
                          002
                        </span>
                      </div>

                      <div className="flex-1 p-5 sm:p-6 space-y-3 border-b border-[#C5C5CC] dark:border-white/12">
                        <h2 className="font-display text-2xl font-bold tracking-tight text-[#111114] dark:text-[#F4F4F6]">
                          Reveal Inspector
                        </h2>
                        <p className="text-sm leading-relaxed text-[#5A5A62] dark:text-[#A1A1AA]">
                          Drop the Ghostpix PNG received as a file or document, enter the sender’s
                          password if locked, and extract the hidden message instantly in your
                          browser.
                        </p>
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => navigateTo('reveal')}
                            className="chamfer-btn-sm inline-flex min-h-[44px] items-center gap-2.5 border border-[#111114] dark:border-white/25 bg-[#111114] dark:bg-[#F4F4F6] px-5 py-2.5 font-mono-code text-xs font-semibold tracking-wider text-white dark:text-[#111114] transition-colors hover:bg-[#FF5A1F] hover:border-[#FF5A1F] dark:hover:bg-[#FF5A1F] dark:hover:text-white"
                          >
                            <span>OPEN REVEAL INSPECTOR</span>
                            <ArrowRight
                              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 divide-x divide-[#C5C5CC] dark:divide-white/12">
                        <div className="px-4 py-3">
                          <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                            GPX1 Header
                          </p>
                          <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                            Verified Bit Integrity
                          </p>
                        </div>
                        <div className="px-4 py-3">
                          <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                            PBKDF2 Unlock
                          </p>
                          <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                            One-Click Copy Output
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <StepByStepGuide onOpenPage={(page) => navigateTo(page)} />

                <HowItWorks onOpenPage={(page) => navigateTo(page)} />

                {/* Bottom Architectural Action Grid */}
                <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
                  <div className="grid items-center border border-[#C5C5CC] dark:border-white/15 bg-[#F2F2F4]/60 dark:bg-[#121217]/65 backdrop-blur-md md:grid-cols-[1fr_auto_0.9fr]">
                    <div className="p-6 sm:p-7 space-y-2 border-b md:border-b-0 md:border-r border-[#C5C5CC] dark:border-white/15">
                      <p className="font-mono-code text-xs font-medium text-[#5A5A62] dark:text-[#A1A1AA]">
                        ▸ READY TO PROTECT
                      </p>
                      <p className="inline-block bg-[#111114] dark:bg-[#F4F4F6] px-2.5 py-1 font-display text-lg font-bold tracking-tight text-white dark:text-[#111114]">
                        YOUR SECRET MESSAGE?
                      </p>
                    </div>

                    <div
                      aria-hidden="true"
                      className="hidden md:flex items-center justify-center px-8 py-6 border-r border-[#C5C5CC] dark:border-white/15 text-[#111114]/25 dark:text-white/25"
                    >
                      <ArrowRight className="h-9 w-9 stroke-[1.5]" />
                    </div>

                    <div className="p-5 sm:p-6 flex flex-col gap-2.5">
                      <button
                        type="button"
                        onClick={() => navigateTo('hide')}
                        className="chamfer-btn-sm btn-hover-glint w-full min-h-[42px] bg-[#FF5A1F] px-4 py-2 font-mono-code text-xs font-semibold tracking-wider text-white transition-colors hover:bg-[#111114] dark:hover:bg-[#F4F4F6] dark:hover:text-[#111114]"
                      >
                        OPEN HIDE VAULT
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateTo('reveal')}
                        className="chamfer-btn-sm w-full min-h-[42px] border border-[#C5C5CC] dark:border-white/20 bg-white dark:bg-[#18181F] px-4 py-2 font-mono-code text-xs font-semibold tracking-wider text-[#111114] dark:text-[#F4F4F6] transition-colors hover:border-[#111114] dark:hover:border-white"
                      >
                        OPEN REVEAL INSPECTOR
                      </button>
                    </div>
                  </div>
                </section>
              </motion.div>
            )}

            {activePage === 'hide' && (
              <motion.div
                key="page-hide-vault"
                initial={prefersReducedMotion ? false : { opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, x: -14 }}
                transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Dedicated Hide Vault Page Header */}
                <section className="mx-auto max-w-6xl px-4 pt-6 pb-6 sm:px-6 lg:px-8">
                  <div className="border border-[#C5C5CC] dark:border-white/15 bg-[#F2F2F4]/70 dark:bg-[#121217]/75 backdrop-blur-md">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C5C5CC] dark:border-white/15 px-5 py-3 sm:px-7">
                      <button
                        type="button"
                        onClick={() => navigateTo('overview')}
                        className="inline-flex min-h-[38px] items-center gap-2 font-mono-code text-xs font-semibold text-[#5A5A62] dark:text-[#A1A1AA] transition-colors hover:text-[#FF5A1F] focus-visible:outline-2 focus-visible:outline-[#FF5A1F]"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Back to Overview</span>
                      </button>

                      <div className="flex items-center gap-2.5">
                        {renderThemeButton()}
                        <button
                          type="button"
                          onClick={() => navigateTo('reveal')}
                          className="inline-flex min-h-[40px] items-center gap-2 border border-[#C5C5CC] dark:border-white/20 bg-white dark:bg-[#18181F] px-3.5 py-2 font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6] transition-colors hover:border-[#FF5A1F] whitespace-nowrap shrink-0"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Switch to Reveal</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid border-b border-[#C5C5CC] dark:border-white/15 md:grid-cols-[1.2fr_1fr]">
                      <div className="min-w-0 px-5 py-5 sm:px-7 sm:py-6 md:border-r border-[#C5C5CC] dark:border-white/15 flex items-center justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                          <span className="font-mono-code text-[11px] font-medium text-[#FF5A1F]">
                            VAULT 01 · LSB ENCODER
                          </span>
                          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold uppercase leading-[0.9] tracking-[-0.02em] text-[#111114] dark:text-[#F4F4F6]">
                            Hide<span className="text-[#FF5A1F]">_</span>Vault
                          </h1>
                        </div>
                        <span className="shrink-0 font-condensed text-4xl font-bold leading-none text-[#111114] dark:text-[#F4F4F6]">
                          01
                        </span>
                      </div>

                      <div className="min-w-0 px-5 py-5 sm:px-7 sm:py-6 flex flex-col justify-center gap-1.5 bg-[#F7F7F9]/75 dark:bg-white/[0.02]">
                        <p className="font-display text-base font-bold text-[#111114] dark:text-[#F4F4F6]">
                          Embed a secret message inside a lossless PNG
                        </p>
                        <p className="text-xs sm:text-sm text-[#5A5A62] dark:text-[#A1A1AA]">
                          Writes GPX1 header + UTF-8 or AES-GCM payload directly into pixel RGB
                          LSBs inside your browser.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 divide-x divide-[#C5C5CC] dark:divide-white/12 bg-white/75 dark:bg-white/[0.02]">
                      <div className="px-4 py-2.5">
                        <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                          RGB LSB
                        </p>
                        <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                          Alpha Flattened
                        </p>
                      </div>
                      <div className="px-4 py-2.5">
                        <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                          AES-GCM
                        </p>
                        <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                          Optional Lock
                        </p>
                      </div>
                      <div className="px-4 py-2.5">
                        <p className="font-mono-code text-xs font-semibold text-[#111114] dark:text-[#F4F4F6]">
                          8×8 Grid
                        </p>
                        <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                          Bit Delta Preview
                        </p>
                      </div>
                      <div className="px-4 py-2.5">
                        <p className="font-mono-code text-xs font-semibold text-[#FF5A1F]">PNG</p>
                        <p className="text-[11px] text-[#5A5A62] dark:text-[#A1A1AA]">
                          Send as File / Doc
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section
                  id="hide-workspace"
                  aria-label="Hide Vault workspace"
                  className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8"
                >
                  <HideWorkspace onSendToReveal={handleSendToReveal} />
                </section>
              </motion.div>
            )}

            {activePage === 'reveal' && (
              <motion.div
                key="page-reveal-inspector"
                initial={prefersReducedMotion ? false : { opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, x: -14 }}
                transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Dedicated Reveal Inspector Page Header */}
                <section className="mx-auto max-w-6xl px-4 pt-6 pb-6 sm:px-6 lg:px-8">
                  <div className="border border-[#C5C5CC] dark:border-white/15 bg-[#F2F2F4]/70 dark:bg-[#121217]/75 backdrop-blur-md">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C5C5CC] dark:border-white/15 px-5 py-3 sm:px-7">
                      <button
                        type="button"
                        onClick={() => navigateTo('overview')}
                        className="inline-flex min-h-[38px] items-center gap-2 font-mono-code text-xs font-semibold text-[#5A5A62] dark:text-[#A1A1AA] transition-colors hover:text-[#FF5A1F] focus-visible:outline-2 focus-visible:outline-[#FF5A1F]"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Back to Overview</span>
                      </button>

                      <div className="flex items-center gap-2.5">
                        {renderThemeButton()}
                        <button
                          type="button"
                          onClick={() => navigateTo('hide')}
                          className="chamfer-btn-sm inline-flex min-h-[40px] items-center gap-2 bg-[#FF5A1F] px-3.5 py-2 font-mono-code text-xs font-semibold text-white transition-colors hover:bg-[#111114] dark:hover:bg-[#F4F4F6] dark:hover:text-[#111114] whitespace-nowrap shrink-0"
                        >
                          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Open Hide Vault</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-[1.2fr_1fr]">
                      <div className="min-w-0 px-5 py-5 sm:px-7 sm:py-6 md:border-r border-[#C5C5CC] dark:border-white/15 flex items-center justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <span className="font-mono-code text-[11px] font-medium text-[#FF5A1F]">
                            VAULT 02 · LSB EXTRACTOR
                          </span>
                          <h1 className="font-display text-2xl sm:text-4xl lg:text-5xl font-bold uppercase leading-[0.92] tracking-[-0.02em] text-[#111114] dark:text-[#F4F4F6]">
                            Reveal<span className="text-[#FF5A1F]">_</span>Inspector
                          </h1>
                        </div>
                        <span className="shrink-0 font-condensed text-3xl sm:text-4xl font-bold leading-none text-[#111114] dark:text-[#F4F4F6]">
                          02
                        </span>
                      </div>

                      <div className="min-w-0 px-5 py-5 sm:px-7 sm:py-6 flex flex-col justify-center gap-1.5 bg-[#F7F7F9]/75 dark:bg-white/[0.02]">
                        <p className="font-display text-base font-bold text-[#111114] dark:text-[#F4F4F6]">
                          Decode hidden GPX1 messages locally
                        </p>
                        <p className="text-xs sm:text-sm text-[#5A5A62] dark:text-[#A1A1AA]">
                          Drop the PNG received as a file or document, enter the unlock key if
                          encrypted, and copy the decoded output.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section
                  id="reveal-workspace"
                  aria-label="Reveal Inspector workspace"
                  className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8"
                >
                  <RevealWorkspace
                    pendingFile={pendingRevealFile}
                    onPendingFileConsumed={() => setPendingRevealFile(null)}
                  />
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <footer className="border-t border-[#C5C5CC] dark:border-white/12 bg-[#DDDDE0]/60 dark:bg-white/[0.02] py-5 text-xs text-[#5A5A62] dark:text-[#A1A1AA]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-2 font-mono-code">
            <span className="font-semibold text-[#111114] dark:text-[#F4F4F6]">
              Ghost<span className="text-[#FF5A1F]">_</span>pix · Client-Side Steganography
            </span>
            <span>All Canvas & Web Crypto operations stay on device</span>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}

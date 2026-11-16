import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Eye, EyeOff, LayoutGrid } from 'lucide-react';

export type AppPage = 'overview' | 'hide' | 'reveal';

interface TopBarProps {
  activePage: AppPage;
  onNavigate: (page: AppPage, anchorId?: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ activePage, onNavigate }) => {
  const prefersReducedMotion = useReducedMotion();

  const ctaTarget: AppPage = activePage === 'hide' ? 'reveal' : 'hide';
  const ctaLabel = activePage === 'hide' ? 'Open Reveal' : 'Open Hide Vault';

  const navItems: Array<{ id: string; label: string; page: AppPage; anchor?: string; isActive: boolean }> = [
    { id: 'overview', label: 'Overview', page: 'overview', isActive: activePage === 'overview' },
    { id: 'hide', label: 'Hide Vault', page: 'hide', isActive: activePage === 'hide' },
    { id: 'reveal', label: 'Reveal', page: 'reveal', isActive: activePage === 'reveal' },
    { id: 'how-to-use', label: 'How to use', page: 'overview', anchor: 'how-to-use', isActive: false },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 h-14 border-b border-[#C5C5CC] dark:border-white/12 bg-[#E6E6E8]/88 dark:bg-[#0B0B0F]/88 backdrop-blur-md transition-colors duration-300">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Brand Title */}
          <a
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('overview');
            }}
            className="font-display text-lg font-bold tracking-tight text-[#111114] dark:text-[#F4F4F6] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF5A1F]"
          >
            Ghost<span className="text-[#FF5A1F]">_</span>pix
          </a>

          {/* Zone 2: Clean Single-Line Nav Links with Shared-Layout Spring Underline */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-6 font-mono-code text-xs font-medium text-[#5A5A62] dark:text-[#A1A1AA]"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.page, item.anchor)}
                className={`relative px-1.5 py-2 transition-colors whitespace-nowrap shrink-0 hover:text-[#111114] dark:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A1F] ${
                  item.isActive ? 'text-[#111114] dark:text-white font-semibold' : ''
                }`}
              >
                <span>{item.label}</span>
                {item.isActive && (
                  <motion.span
                    layoutId={prefersReducedMotion ? undefined : 'topbar-active-underline'}
                    transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0.5 h-[2px] bg-[#FF5A1F]"
                  />
                )}
              </button>
            ))}
          </nav>

          {/* Zone 3: Primary Chamfered Action */}
          <div className="shrink-0">
            <a
              href={ctaTarget === 'hide' ? '#/hide-vault' : '#/reveal-inspector'}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(ctaTarget);
              }}
              className="chamfer-btn-sm btn-hover-glint inline-flex min-h-[38px] items-center gap-1.5 bg-[#FF5A1F] px-4 py-1.5 font-mono-code text-xs font-semibold tracking-wide text-white transition-colors hover:bg-[#111114] dark:hover:bg-[#F4F4F6] dark:hover:text-[#111114] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A1F]"
            >
              <span>{ctaLabel}</span>
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      {/* Mobile Sticky Bottom Dock with Shared-Layout Spring Highlight (<= 7% viewport height) */}
      <nav
        aria-label="Mobile workspace navigation"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-[#C5C5CC] dark:border-white/15 bg-[#E6E6E8]/95 dark:bg-[#0B0B0F]/95 backdrop-blur-xl"
      >
        {(
          [
            { page: 'overview' as AppPage, label: 'Overview', icon: LayoutGrid },
            { page: 'hide' as AppPage, label: 'Hide', icon: EyeOff },
            { page: 'reveal' as AppPage, label: 'Reveal', icon: Eye },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activePage === tab.page;
          return (
            <button
              key={tab.page}
              type="button"
              onClick={() => onNavigate(tab.page)}
              className={`relative flex min-h-[52px] items-center justify-center gap-1.5 font-mono-code text-xs font-semibold transition-colors whitespace-nowrap ${
                active
                  ? 'text-[#111114] dark:text-[#111114]'
                  : 'text-[#5A5A62] dark:text-[#A1A1AA]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId={prefersReducedMotion ? undefined : 'mobile-dock-active-bg'}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  aria-hidden="true"
                  className="absolute inset-0 bg-white dark:bg-[#F4F4F6] border-t-2 border-[#FF5A1F]"
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tab.label}</span>
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

import React, { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface LiquidGlassPanelProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section';
  'aria-labelledby'?: string;
  'data-testid'?: string;
}

export const LiquidGlassPanel: React.FC<LiquidGlassPanelProps> = ({
  children,
  className = '',
  delay = 0,
  as = 'div',
  'aria-labelledby': ariaLabelledBy,
  'data-testid': dataTestId,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [glint, setGlint] = useState({ x: 50, y: 0, active: false });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || e.pointerType === 'touch') return;
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setGlint({ x, y, active: true });
  };

  const handlePointerLeave = () => {
    if (glint.active) {
      setGlint((prev) => ({ ...prev, active: false }));
    }
  };

  const MotionTag = as === 'section' ? motion.section : motion.div;

  return (
    <MotionTag
      ref={panelRef}
      aria-labelledby={ariaLabelledBy}
      data-testid={dataTestId}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 14, scale: 0.988 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : {
              type: 'spring',
              stiffness: 290,
              damping: 26,
              delay,
            }
      }
      className={`liquid-glass relative overflow-hidden ${className}`}
    >
      {/* Subtle top glass specular highlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-65 dark:opacity-25"
      />

      {/* Interactive Signal Orange radial pointer sheen */}
      {!prefersReducedMotion && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: glint.active ? 1 : 0,
            background: `radial-gradient(360px circle at ${glint.x}% ${glint.y}%, rgba(255,90,31,0.085), rgba(255,90,31,0.025) 45%, transparent 72%)`,
          }}
        />
      )}

      <div className="relative z-10">{children}</div>
    </MotionTag>
  );
};

import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';

interface ScrambleRevealTextProps {
  text: string;
  revealKey?: number;
  className?: string;
}

const GLYPHS = '01#@%&*+=?/<>~^';

export const ScrambleRevealText: React.FC<ScrambleRevealTextProps> = ({
  text,
  revealKey = 0,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [displayText, setDisplayText] = useState(text);

  useEffect(() => {
    if (prefersReducedMotion || !text) {
      setDisplayText(text);
      return;
    }

    const chars = Array.from(text);
    const totalFrames = 16;
    let frame = 0;

    const timer = window.setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      const settledCount = Math.floor(progress * chars.length);

      const next = chars
        .map((ch, idx) => {
          if (ch === '\n' || ch === ' ' || ch === '\t') return ch;
          if (idx < settledCount) return ch;
          return GLYPHS[(idx + frame * 3) % GLYPHS.length];
        })
        .join('');

      setDisplayText(next);

      if (frame >= totalFrames) {
        window.clearInterval(timer);
        setDisplayText(text);
      }
    }, 32);

    return () => window.clearInterval(timer);
  }, [text, revealKey, prefersReducedMotion]);

  return (
    <pre
      aria-label={text}
      className={`font-mono-code whitespace-pre-wrap break-words text-sm leading-relaxed text-[#0D0D0F] dark:text-[#F5F5FA] ${className}`}
    >
      {displayText}
    </pre>
  );
};

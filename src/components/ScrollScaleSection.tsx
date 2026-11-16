import React, { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';

interface ScrollScaleSectionProps {
  children: React.ReactNode;
  minScale?: number;
  className?: string;
}

export const ScrollScaleSection: React.FC<ScrollScaleSectionProps> = ({
  children,
  minScale = 0.95,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [minScale, 1, minScale]);
  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0.88, 1, 1, 0.88]);

  if (prefersReducedMotion) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} style={{ scale, opacity }} className={className}>
      {children}
    </motion.div>
  );
};

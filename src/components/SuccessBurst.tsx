import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, Lock } from 'lucide-react';

interface SuccessBurstProps {
  burstKey: number;
  isEncrypted: boolean;
}

const PARTICLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const dist = 32 + (i % 3) * 12;
  return {
    id: i,
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    color:
      i % 3 === 0
        ? 'bg-[#FF5A1F]'
        : i % 3 === 1
          ? 'bg-[#111114] dark:bg-[#F4F4F6]'
          : 'bg-[#FF8254]',
  };
});

export const SuccessBurst: React.FC<SuccessBurstProps> = ({ burstKey, isEncrypted }) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div key={burstKey} className="relative inline-flex h-11 w-11 items-center justify-center shrink-0">
      {!prefersReducedMotion &&
        PARTICLES.map((p) => (
          <motion.span
            key={p.id}
            aria-hidden="true"
            initial={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }}
            animate={{ x: p.x, y: p.y, scale: 0, opacity: 0, rotate: 90 }}
            transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
            className={`pointer-events-none absolute h-1.5 w-1.5 ${p.color}`}
          />
        ))}

      <motion.div
        initial={prefersReducedMotion ? false : { scale: 0.7, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 20 }}
        className="flex h-11 w-11 items-center justify-center border border-[#FF5A1F]/45 bg-[#FF5A1F]/12 text-[#FF5A1F]"
      >
        {isEncrypted ? (
          <Lock className="h-5 w-5 text-[#FF5A1F]" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-5 w-5 text-[#FF5A1F]" aria-hidden="true" />
        )}
      </motion.div>
    </div>
  );
};

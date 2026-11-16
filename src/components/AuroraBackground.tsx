import React from 'react';

export const AuroraBackground: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#E6E6E8] dark:bg-[#0B0B0F] transition-colors duration-300"
    >
      {/* Slowly drifting caustic atmosphere in Signal Orange & Deep Violet */}
      <div
        className="caustic-orb-a absolute -top-[18%] -left-[8%] h-[42vw] w-[42vw] max-h-[540px] max-w-[540px] rounded-full opacity-45 dark:opacity-35 blur-[96px]"
        style={{
          background:
            'radial-gradient(circle, rgba(255, 90, 31, 0.22) 0%, rgba(255, 90, 31, 0.05) 55%, transparent 75%)',
        }}
      />
      <div
        className="caustic-orb-b absolute top-[35%] -right-[10%] h-[44vw] w-[44vw] max-h-[580px] max-w-[580px] rounded-full opacity-40 dark:opacity-30 blur-[104px]"
        style={{
          background:
            'radial-gradient(circle, rgba(124, 92, 255, 0.16) 0%, rgba(34, 211, 238, 0.05) 55%, transparent 75%)',
        }}
      />

      {/* Exposed Swiss Blueprint Grid Lines */}
      <div
        className="absolute inset-0 opacity-[0.055] dark:opacity-[0.045]"
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Micro-registration crosshair intersections */}
      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.035]"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
    </div>
  );
};

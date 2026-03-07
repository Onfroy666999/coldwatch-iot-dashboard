import { useEffect } from 'react';
import { motion } from 'motion/react';

interface SplashScreenProps {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: SplashScreenProps) {
  // Auto-advance after 3s — enough time for the animation to finish
  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: '#2D3436' }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      {/* Subtle radial glow behind logo */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(9,132,227,0.12) 0%, transparent 70%)',
          filter: 'blur(32px)',
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />

      {/* Logo mark + wordmark */}
      <div className="relative z-10 flex flex-col items-center gap-5">

        {/* Snowflake icon box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center"
            style={{
              background: 'rgba(9,132,227,0.12)',
              border: '1.5px solid rgba(9,132,227,0.35)',
              boxShadow: '0 0 48px rgba(9,132,227,0.2)',
            }}
          >
            {/* Inline SVG snowflake — matches Lucide's Snowflake exactly */}
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0984E3"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="12" y1="2"  x2="12" y2="22" />
              <path d="m20 16-4-4 4-4" />
              <path d="m4 8 4 4-4 4" />
              <path d="m16 4-4 4-4-4" />
              <path d="m8 20 4-4 4 4" />
            </svg>
          </div>
        </motion.div>

        {/* Wordmark */}
        <motion.div
          className="flex flex-col items-center gap-1"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.45, ease: 'easeOut' }}
        >
          <span
            className="text-white font-bold tracking-tight"
            style={{ fontSize: '1.75rem', letterSpacing: '-0.03em' }}
          >
            ColdWatch
          </span>
          <span
            className="text-[10px] font-semibold tracking-[0.18em] uppercase"
            style={{ color: 'rgba(9,132,227,0.75)' }}
          >
            Cold Chain Monitor
          </span>
        </motion.div>

        {/* Loading dot pulse — subtle, below wordmark */}
        <motion.div
          className="flex items-center gap-1.5 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                backgroundColor: 'rgba(9,132,227,0.6)',
              }}
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.18,
                ease: 'easeInOut',
              }}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
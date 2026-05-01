import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Snowflake } from 'lucide-react';

interface SplashScreenProps {
  onDone: () => void;
  appReady?: boolean;
}

export default function SplashScreen({ onDone, appReady = false }: SplashScreenProps) {
  const minElapsed = useRef(false);
  const doneRef    = useRef(onDone);
  doneRef.current  = onDone;

  // Minimum display: 2 seconds so the animation has time to complete
  useEffect(() => {
    const t = setTimeout(() => {
      minElapsed.current = true;
      if (appReady) doneRef.current();
    }, 2000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  // Dismiss as soon as both conditions are true:
  // 1. Minimum time has elapsed  2. AppContext bootstrap is complete
  useEffect(() => {
    if (appReady && minElapsed.current) doneRef.current();
  }, [appReady]);

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: '#2D3436' }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      <motion.div
        className="absolute pointer-events-none"
        style={{
          width: 320, height: 320, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(9,132,227,0.12) 0%, transparent 70%)',
          filter: 'blur(32px)',
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />

      <div className="relative z-10 flex flex-col items-center gap-5">
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center"
            style={{
              background: 'rgba(9,132,227,0.12)',
              border: '1.5px solid rgba(9,132,227,0.25)',
            }}
          >
            <Snowflake className="w-12 h-12" style={{ color: '#0984E3' }} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: 'easeOut' }}
          className="text-center"
        >
          <p className="text-3xl font-bold tracking-tight" style={{ color: '#FFFFFF' }}>
            ColdWatch
          </p>
          <p className="text-xs font-semibold tracking-[0.2em] uppercase mt-1"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            IoT Cold Chain Monitor
          </p>
        </motion.div>

        {/* Three-dot pulse — shows while bootstrap is in progress */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="flex gap-1.5 mt-2"
        >
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: 'rgba(9,132,227,0.6)' }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}

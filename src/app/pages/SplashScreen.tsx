import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SplashScreenProps {
  onDone: () => void;
  appReady?: boolean;
}

export default function SplashScreen({ onDone, appReady = false }: SplashScreenProps) {
  const minElapsed = useRef(false);
  const doneRef    = useRef(onDone);
  doneRef.current  = onDone;

  // Controls the X-style zoom-out burst transition
  const [zooming, setZooming] = useState(false);

  // Minimum display time: 1.2s — enough for the logo to settle before zooming
  useEffect(() => {
    const t = setTimeout(() => {
      minElapsed.current = true;
      if (appReady) triggerZoom();
    }, 1200);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (appReady && minElapsed.current) triggerZoom();
  }, [appReady]); // eslint-disable-line

  function triggerZoom() {
    setZooming(true);
    // Let the zoom animation run (350ms) then unmount the splash
    setTimeout(() => doneRef.current(), 350);
  }

  return (
    <AnimatePresence>
      {/* Full-screen white backdrop — fades out as the logo zooms */}
      <motion.div
        key="splash-bg"
        className="fixed inset-0 flex items-center justify-center"
        style={{ backgroundColor: '#FFFFFF', zIndex: 9999 }}
        animate={zooming ? { opacity: 0 } : { opacity: 1 }}
        transition={zooming
          ? { duration: 0.35, ease: 'easeIn' }
          : { duration: 0 }
        }
      >
        {/* Logo + wordmark — starts at normal size, then bursts to ~8x together (same as X's transition) */}
        <motion.div
          style={{ transformOrigin: 'center center' }}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={
            zooming
              ? { scale: 8, opacity: 0 }
              : { scale: 1,  opacity: 1 }
          }
          transition={
            zooming
              ? { duration: 0.35, ease: [0.55, 0, 1, 0.45] }
              : { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }
          }
        
        >
          <img
            src="/cdw.png"
            alt="ColdWatch"
            style={{
              width:  110,
              height: 110,
              objectFit: 'contain',
              // Prevents the image from blurring as it scales up
              imageRendering: 'crisp-edges',
            }}
            draggable={false}
          />
          
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Snowflake, Bell, Wifi, ChevronRight, Thermometer, Droplets, Activity } from 'lucide-react';

interface OnboardingProps {
  onComplete: () => void;
}

const slides = [
  {
    id: 0,
    tag: 'Real-Time Monitoring',
    headline: 'Guard\nEvery\nDegree.',
    sub: 'ColdWatch connects to your IoT sensors and gives you a live feed of every storage unit temperature, humidity, and system status from one dashboard.',
    icon: Thermometer,
    accentColor: '#2979C8',
    glowColor: 'rgba(41, 121, 200, 0.35)',
    stats: [
      { value: '±0.1°C', label: 'Accuracy' },
      { value: '3s', label: 'Update Rate' },
      { value: '24/7', label: 'Uptime' },
    ],
  },
  {
    id: 1,
    tag: 'Smart Alerting',
    headline: 'Know\nBefore\nYou Lose.',
    sub: 'Set custom warning and critical thresholds. ColdWatch notifies you the moment a breach starts not after the damage is done.',
    icon: Bell,
    accentColor: '#E67E22',
    glowColor: 'rgba(230, 126, 34, 0.35)',
    stats: [
      { value: 'SMS', label: 'Alerts' },
      { value: 'Email', label: 'Reports' },
      { value: 'Push', label: 'Notify' },
    ],
  },
  {
    id: 2,
    tag: 'Remote Control',
    headline: 'Command\nFrom\nAnywhere.',
    sub: 'Adjust target temperatures, toggle cooling modes, and manage all your storage units remotely no matter where you are.',
    icon: Wifi,
    accentColor: '#27AE60',
    glowColor: 'rgba(39, 174, 96, 0.35)',
    stats: [
      { value: '3+', label: 'Devices' },
      { value: 'ESP32', label: 'Powered' },
      { value: 'Secure', label: 'Auth' },
    ],
  },
];

// Floating particle component
function Particle({ delay, x, y, size }: { delay: number; x: number; y: number; size: number }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        background: 'rgba(255,255,255,0.08)',
      }}
      animate={{
        y: [0, -30, 0],
        opacity: [0.3, 0.8, 0.3],
        scale: [1, 1.2, 1],
      }}
      transition={{
        duration: 4 + Math.random() * 3,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

const particles = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 3 + Math.random() * 8,
  delay: Math.random() * 4,
}));

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const slide = slides[current];
  const Icon = slide.icon;
  const isLast = current === slides.length - 1;

  const goNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setDirection(1);
      setCurrent(c => c + 1);
    }
  };

  const goPrev = () => {
    if (current > 0) {
      setDirection(-1);
      setCurrent(c => c - 1);
    }
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const swipeThreshold = 50;
    const velocityThreshold = 300;
    if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
      goNext(); // swiped left → forward
    } else if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
      goPrev(); // swiped right → back
    }
  };

  const goTo = (idx: number) => {
    setDirection(idx > current ? 1 : -1);
    setCurrent(idx);
  };

  const variants = {
    enter: (dir: number) => ({ x: dir * 60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: -dir * 60, opacity: 0 }),
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden flex flex-col items-center justify-between py-12 px-6"
      style={{
        background: 'radial-gradient(ellipse at 30% 20%, #1a3a6e 0%, #0f1f3d 45%, #080f1f 100%)',
      }}
    >
      {/* Animated background particles */}
      {particles.map(p => (
        <Particle key={p.id} {...p} />
      ))}

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Top bar — logo + skip */}
      <motion.div
        className="relative z-10 w-full max-w-sm flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(41,121,200,0.25)', border: '1px solid rgba(41,121,200,0.4)' }}
          >
            <Snowflake className="w-4 h-4 text-white" />
          </div>
          <span className="text-white text-sm tracking-wide" style={{ fontFamily: 'Inter, sans-serif' }}>
            ColdWatch
          </span>
        </div>
        <button
          onClick={() => {
            onComplete();
          }}
          className="text-white/40 text-sm hover:text-white/70 transition-colors"
        >
          Skip
        </button>
      </motion.div>

      {/* Main glass card */}
      <div className="relative z-10 w-full max-w-sm flex-1 flex items-center">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={slide.id}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            className="w-full cursor-grab active:cursor-grabbing"
          >
            {/* Glass card */}
            <div
              className="rounded-3xl p-8 w-full"
              style={{
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: `0 32px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)`,
              }}
            >
              {/* Tag */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6"
                style={{
                  background: `rgba(${slide.accentColor === '#2979C8' ? '41,121,200' : slide.accentColor === '#E67E22' ? '230,126,34' : '39,174,96'}, 0.15)`,
                  border: `1px solid ${slide.accentColor}40`,
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: slide.accentColor }} />
                <span className="text-xs tracking-widest uppercase" style={{ color: slide.accentColor }}>
                  {slide.tag}
                </span>
              </motion.div>

              {/* Hero icon with glow */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
                className="mb-6"
              >
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-20 h-20 rounded-2xl flex items-center justify-center relative"
                  style={{
                    background: `linear-gradient(135deg, ${slide.accentColor}30, ${slide.accentColor}15)`,
                    border: `1px solid ${slide.accentColor}40`,
                    boxShadow: `0 0 40px ${slide.glowColor}`,
                  }}
                >
                  <Icon className="w-10 h-10" style={{ color: slide.accentColor }} />
                  {/* Inner glow ring */}
                  <div
                    className="absolute inset-0 rounded-2xl"
                    style={{
                      background: `radial-gradient(circle at center, ${slide.accentColor}20 0%, transparent 70%)`,
                    }}
                  />
                </motion.div>
              </motion.div>

              {/* Headline */}
              <motion.h1
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-white mb-4"
                style={{
                  fontSize: '2.4rem',
                  fontWeight: 700,
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                  whiteSpace: 'pre-line',
                }}
              >
                {slide.headline}
              </motion.h1>

              {/* Body */}
              <motion.p
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="text-sm leading-relaxed mb-8"
                style={{ color: 'rgba(255,255,255,0.55)' }}
              >
                {slide.sub}
              </motion.p>

              {/* Stats row */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="grid grid-cols-3 gap-3 mb-2"
              >
                {slide.stats.map((stat, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-3 text-center"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <p className="text-white text-sm font-semibold">{stat.value}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {stat.label}
                    </p>
                  </div>
                ))}
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom — dots + CTA */}
      <motion.div
        className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        {/* Dot indicators */}
        <div className="flex items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="transition-all duration-300"
              style={{
                width: i === current ? 24 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === current ? slide.accentColor : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>

        {/* CTA button */}
        <motion.button
          onClick={goNext}
          whileTap={{ scale: 0.97 }}
          className="w-full py-4 rounded-2xl text-white font-semibold flex items-center justify-center gap-2 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${slide.accentColor}, ${slide.accentColor}cc)`,
            boxShadow: `0 8px 32px ${slide.glowColor}`,
            fontSize: '0.95rem',
            letterSpacing: '0.01em',
          }}
        >
          {/* Shimmer sweep */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)',
              backgroundSize: '200% 100%',
            }}
            animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear', repeatDelay: 1 }}
          />
          <span className="relative z-10">{isLast ? 'Get Started' : 'Continue'}</span>
          <ChevronRight className="w-4 h-4 relative z-10" />
        </motion.button>

        {isLast && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-center"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            By continuing you agree to ColdWatch's terms of service
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}

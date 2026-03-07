import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Snowflake, ChevronRight, ChevronLeft } from 'lucide-react';
import slide1Img from '../../assets/slide1.png';
import slide2Img from '../../assets/slide2.png';
import slide3Img from '../../assets/slide3.jpg';

interface OnboardingProps {
  onComplete: () => void;
}

const slides = [
  {
    id: 0,
    tag: 'The Problem',
    headline: 'Spoilage Starts Silently.',
    sub: 'Up to 45% of produce in Ghana is lost after harvest, most of it in storage, most of it preventable. A few degrees too warm is all it takes.',
    photo: slide1Img,
    // Position the market scene — centre the farmer's face
    photoPosition: 'center 30%',
    accentColor: '#00CEC9',
    tagBg: 'rgba(0, 206, 201, 0.12)',
    tagBorder: 'rgba(0, 206, 201, 0.3)',
    stats: [
      { value: '45%', label: 'Lost post-harvest' },
      { value: '48hrs', label: 'Before damage shows' },
      { value: '₵2,400', label: 'Avg. loss per tonne' },
    ],
  },
  {
    id: 1,
    tag: 'Early Warning',
    headline: "Know Before It's Gone.",
    sub: 'ColdWatch watches your storage around the clock. The moment temperature or humidity drifts out of range, you get an alert before your produce is affected.',
    photo: slide2Img,
    // Centre on the man's face and phone
    photoPosition: 'center 20%',
    accentColor: '#D3B037',
    tagBg: 'rgba(211, 176, 55, 0.12)',
    tagBorder: 'rgba(211, 176, 55, 0.3)',
    stats: [
      { value: '3s', label: 'Alert speed' },
      { value: 'SMS', label: 'No app needed' },
      { value: '24/7', label: 'Never sleeps' },
    ],
  },
  {
    id: 2,
    tag: 'Your Produce, Protected',
    headline: 'Less Waste, More Income.',
    sub: 'Set the right conditions for what you store like yams, tomatoes, leafy greens. Let ColdWatch keep everything on track. Less loss means better prices and a stronger business.',
    photo: slide3Img,
    // Show the full cold room with the open door
    photoPosition: 'center center',
    accentColor: '#0984E3',
    tagBg: 'rgba(9, 132, 227, 0.12)',
    tagBorder: 'rgba(9, 132, 227, 0.3)',
    stats: [
      { value: '80%', label: 'Loss preventable' },
      { value: 'Tubers', label: 'Fruits · Leafy' },
      { value: 'Free', label: 'To get started' },
    ],
  },
];

// Animation variants — module-level to avoid recreation on every render
const slideVariants = {
  enter:  (d: number) => ({ x: d * 56, opacity: 0 }),
  center:              { x: 0, opacity: 1 },
  exit:   (d: number) => ({ x: -d * 56, opacity: 0 }),
};

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false); // true once user manually interacts
  const slide = slides[current];
  const isLast = current === slides.length - 1;

  //  Autoplay: advance every 10s, stop permanently on last slide 
  useEffect(() => {
    if (isLast || paused) return;
    const timer = setTimeout(() => {
      setDirection(1);
      setCurrent(c => c + 1);
    }, 10000);
    return () => clearTimeout(timer);
  }, [current, isLast, paused]);

  const goNext = () => {
    setPaused(true);
    if (isLast) { onComplete(); return; }
    setDirection(1);
    setCurrent(c => c + 1);
  };

  const goPrev = () => {
    setPaused(true);
    if (current === 0) return;
    setDirection(-1);
    setCurrent(c => c - 1);
  };

  const goTo = (idx: number) => {
    setDirection(idx > current ? 1 : -1);
    setCurrent(idx);
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (info.offset.x < -50 || info.velocity.x < -300) goNext();
    else if (info.offset.x > 50 || info.velocity.x > 300) goPrev();
  };

  return (
    <div
      className="h-screen overflow-hidden relative flex flex-col"
      style={{ backgroundColor: '#1A1F2E' }}
    >
      {/* Full-bleed photo  top 55% of screen  */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`photo-${slide.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="absolute inset-x-0 top-0 pointer-events-none"
          style={{ height: '46vh' }}
        >
          <img
            src={slide.photo}
            alt=""
            className="w-full h-full object-cover"
            style={{ objectPosition: slide.photoPosition }}
          />
          {/* Top scrim keeps logo/skip readable over any image */}
          <div
            className="absolute inset-x-0 top-0"
            style={{
              height: '35%',
              background: 'linear-gradient(to bottom, rgba(26,31,46,0.72) 0%, transparent 100%)',
            }}
          />
          {/* Bottom scrim  bleeds image into dark content zone */}
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              height: '70%',
              background: 'linear-gradient(to bottom, transparent 0%, #1A1F2E 75%)',
            }}
          />
        </motion.div>
      </AnimatePresence>

      {/*  Top bar  floats over photo */}
      <motion.div
        className="relative z-10 flex items-center justify-between px-6 pt-12 pb-4"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: 'rgba(9,132,227,0.2)',
              border: '1px solid rgba(9,132,227,0.4)',
            }}
          >
            <Snowflake style={{ width: 18, height: 18, color: '#0984E3' }} />
          </div>
          <div>
            <span className="text-white text-sm font-bold tracking-tight">ColdWatch</span>
            <div
              className="text-[9px] font-semibold tracking-[0.15em] uppercase"
              style={{ color: 'rgba(9,132,227,0.75)', lineHeight: 1 }}
            >
              Cold Chain Monitor
            </div>
          </div>
        </div>

        {!isLast && (
          <button
            onClick={onComplete}
            className="text-xs font-medium px-3.5 py-2 rounded-lg"
            style={{
              color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            Skip
          </button>
        )}
      </motion.div>

      {/*  Spacer pushes content below the photo  */}
      <div style={{ height: '36vh' }} />

      {/* Content zone — sits in the dark area  */}
      <div className="relative z-10 flex-1 flex flex-col px-6 pt-1 pb-0">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={slide.id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.12}
            onDragEnd={handleDragEnd}
            className="cursor-grab active:cursor-grabbing"
          >
            {/* Tag pill */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-3"
              style={{
                background: slide.tagBg,
                border: `1px solid ${slide.tagBorder}`,
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: slide.accentColor }} />
              <span
                className="text-[10px] font-bold tracking-[0.14em] uppercase"
                style={{ color: slide.accentColor }}
              >
                {slide.tag}
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="mb-2"
              style={{
                fontSize: '1.75rem',
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: '-0.03em',
                color: '#FFFFFF',
              }}
            >
              {(() => {
                const words = slide.headline.split(' ');
                return (
                  <>
                    <span style={{ color: slide.accentColor }}>{words[0]}</span>
                    {' ' + words.slice(1).join(' ')}
                  </>
                );
              })()}
            </motion.h1>

            {/* Body text */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
              className="text-xs leading-relaxed mb-3"
              style={{ color: 'rgba(223,230,233,0.6)', maxWidth: 340 }}
            >
              {slide.sub}
            </motion.p>

            {/* Stats row */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-3 gap-2"
            >
              {slide.stats.map((stat, i) => (
                <div
                  key={i}
                  className="rounded-xl py-2 text-center relative overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div
                    className="absolute top-0 left-1/4 right-1/4 h-px"
                    style={{ background: `linear-gradient(90deg, transparent, ${slide.accentColor}50, transparent)` }}
                  />
                  <p className="text-white text-sm font-bold">{stat.value}</p>
                  <p className="text-[10px] mt-0.5 font-medium" style={{ color: 'rgba(223,230,233,0.35)' }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Bottom controls ── */}
      <motion.div
        className="relative z-10 px-6 pb-8 pt-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <div className="flex items-center justify-center mb-3">
          <div className="flex items-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                style={{
                  width: i === current ? 28 : 8,
                  height: 8,
                  borderRadius: 99,
                  backgroundColor: i === current ? slide.accentColor : 'rgba(255,255,255,0.18)',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <AnimatePresence>
            {current > 0 && (
              <motion.button
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 52 }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.22 }}
                onClick={goPrev}
                className="h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  overflow: 'hidden',
                }}
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </motion.button>
            )}
          </AnimatePresence>

          <motion.button
            layout
            onClick={goNext}
            whileTap={{ scale: 0.97 }}
            className="flex-1 h-12 rounded-2xl text-white font-bold flex items-center justify-center gap-2 relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #0984E3, #0773C8)',
              boxShadow: '0 8px 28px rgba(9,132,227,0.35)',
              fontSize: '0.9rem',
              letterSpacing: '0.01em',
            }}
          >
            <motion.div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.14) 50%, transparent 62%)',
                backgroundSize: '250% 100%',
              }}
              animate={{ backgroundPosition: ['250% 0', '-250% 0'] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'linear', repeatDelay: 1.2 }}
            />
            <span className="relative z-10">{isLast ? 'Get Started' : 'Continue'}</span>
            <ChevronRight className="w-4 h-4 relative z-10" />
          </motion.button>
        </div>

        {isLast && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center text-xs mt-4"
            style={{ color: 'rgba(255,255,255,0.22)' }}
          >
            By continuing you agree to ColdWatch's terms of service
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}
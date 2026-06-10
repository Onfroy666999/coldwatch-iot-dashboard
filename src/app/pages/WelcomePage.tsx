import { motion } from 'motion/react';
import { ChevronRight, Thermometer, Droplets, Bell } from 'lucide-react';
import welcomeHero from '../../assets/welcome-hero.png';

interface WelcomePageProps {
  onContinue: () => void;
}

const stats = [
  { icon: Thermometer, label: 'Temp',     value: '4°C',  color: '#00CEC9' },
  { icon: Droplets,    label: 'Humidity', value: '82%',  color: '#0984E3' },
  { icon: Bell,        label: 'Alerts',   value: 'Live', color: '#27AE60' },
];

export default function WelcomePage({ onContinue }: WelcomePageProps) {
  return (
    <div
      className="h-screen overflow-hidden relative flex flex-col select-none"
      style={{ backgroundColor: '#1A1F2E' }}
    >
      {/* ── Hero photo zone (top ~60%) ──────────────────────────────────────── */}
      <div className="absolute inset-x-0 top-0" style={{ height: '60vh' }}>
        <img
          src={welcomeHero}
          alt=""
          className="w-full h-full object-cover"
          style={{ objectPosition: 'center 15%' }}
        />

        {/* Top scrim — keeps logo readable */}
        <div
          className="absolute inset-x-0 top-0 pointer-events-none"
          style={{
            height: '40%',
            background: 'linear-gradient(to bottom, rgba(26,31,46,0.85) 0%, transparent 100%)',
          }}
        />

        {/* Bottom scrim — bleeds photo into dark content zone */}
        <div
          className="absolute inset-x-0 bottom-0 pointer-events-none"
          style={{
            height: '70%',
            background: 'linear-gradient(to bottom, transparent 0%, #1A1F2E 80%)',
          }}
        />

        {/* ── Logo top-left ── */}
        <motion.div
          className="absolute top-0 left-0 right-0 flex items-center gap-3 px-6 pt-12"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        >
          <img
            src="/cdw.png"
            alt="ColdWatch"
            style={{ width: 40, height: 40, objectFit: 'contain' }}
            draggable={false}
          />
          <div>
            <div className="text-white text-base font-bold tracking-tight leading-none">
              ColdWatch
            </div>
            <div
              className="text-[9px] font-semibold tracking-[0.16em] uppercase mt-0.5"
              style={{ color: 'rgba(9,132,227,0.8)' }}
            >
              Cold Chain Monitor
            </div>
          </div>
        </motion.div>

        {/* ── Floating stat pills ── */}
        <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-2.5 px-6">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 18, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.35 + i * 0.1, ease: [0.34, 1.2, 0.64, 1] }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: `1px solid ${stat.color}40`,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <Icon style={{ width: 11, height: 11, color: stat.color }} strokeWidth={2.5} />
                <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {stat.label}:
                </span>
                <span className="text-[10px] font-bold" style={{ color: stat.color }}>
                  {stat.value}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Spacer pushes content below photo */}
      <div style={{ height: '54vh' }} />

      {/* ── Content zone ────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col px-6 pb-2">

        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          className="inline-flex items-center gap-2 mb-3"
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#27AE60' }} />
          <span
            className="text-[10px] font-bold tracking-[0.16em] uppercase"
            style={{ color: '#27AE60' }}
          >
            Built for Ghanaian Agriculture
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.28 }}
          style={{
            fontSize: '2rem',
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            color: '#FFFFFF',
            marginBottom: '0.625rem',
          }}
        >
          Keep Your{' '}
          <span style={{ color: '#0984E3' }}>Harvest</span>{' '}
          Cold.
          <br />
          Cut Your{' '}
          <span style={{ color: '#00CEC9' }}>Losses.</span>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.36 }}
          className="text-sm leading-relaxed"
          style={{ color: 'rgba(223,230,233,0.55)', maxWidth: 320 }}
        >
          Monitor temperature and humidity in your storage unit from your phone.
          Get instant alerts. Protect your produce — before spoilage starts.
        </motion.p>
      </div>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <motion.div
        className="relative z-10 px-6 pb-10 pt-4"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.44 }}
      >
        <motion.button
          onClick={onContinue}
          whileTap={{ scale: 0.97 }}
          className="w-full h-14 rounded-2xl text-white font-bold flex items-center justify-center gap-2 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #0984E3 0%, #0652a0 100%)',
            boxShadow: '0 10px 32px rgba(9,132,227,0.40)',
            fontSize: '1rem',
            letterSpacing: '0.01em',
          }}
        >
          {/* Shimmer sweep */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.16) 50%, transparent 65%)',
              backgroundSize: '250% 100%',
            }}
            animate={{ backgroundPosition: ['250% 0', '-250% 0'] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'linear', repeatDelay: 1.5 }}
          />
          <span className="relative z-10">Let's Get Started</span>
          <ChevronRight className="w-5 h-5 relative z-10" strokeWidth={2.5} />
        </motion.button>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.65 }}
          className="text-center text-[11px] mt-4"
          style={{ color: 'rgba(255,255,255,0.22)' }}
        >
          For farmers · warehouse managers · produce traders
        </motion.p>
      </motion.div>
    </div>
  );
}

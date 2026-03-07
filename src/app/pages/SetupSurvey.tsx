import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight, ChevronLeft, CheckCircle2, BellOff, Snowflake,
  Store, Warehouse, Truck, User,
  Layers, Package, Apple, Leaf, Wheat,
  Bell, Mail, Phone,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { UserRole, ProduceMode } from '../context/AppContext';

//  Icon wrapper — matches the size/style of the previous lordicon boxes
function CardIcon({ icon: Icon, color, active }: { icon: React.ElementType; color: string; active: boolean }) {
  return (
    <Icon
      style={{ color: active ? color : '#A0A8B5', transition: 'color 0.2s' }}
      size={22}
      strokeWidth={1.75}
    />
  );
}

//  Data tables 
const ROLES: {
  id: UserRole; label: string; description: string;
  icon: React.ElementType; color: string; tint: string;
}[] = [
  { id: 'farmer',            label: 'Farmer',   description: 'I grow or store produce on a farm or smallholding',  icon: Store,     color: '#C0501A', tint: '#FEF0E7' },
  { id: 'warehouse_manager', label: 'Warehouse Manager', description: 'I manage a cold storage facility or warehouse',      icon: Warehouse, color: '#1A65B5', tint: '#EBF3FD' },
  { id: 'transporter',       label: 'Transporter',       description: 'I move produce between farms, markets, distributors', icon: Truck,     color: '#0E7A62', tint: '#E6F6F2' },
  { id: 'other',             label: 'Other',             description: 'My role is different from the options above',        icon: User,      color: '#5D6470', tint: '#F1F2F4' },
];

const PRODUCE: {
  id: ProduceMode; label: string; tagline: string;
  icon: React.ElementType; color: string; tint: string;
}[] = [
  { id: 'mixed',   label: 'Mixed Produce',    tagline: 'Various crop types together',          icon: Layers,  color: '#1A65B5', tint: '#EBF3FD' },
  { id: 'tubers',  label: 'Tubers',           tagline: 'Cassava, Yam, Cocoyam, Plantain',     icon: Package, color: '#B84A00', tint: '#FEF0E7' },
  { id: 'fruits',  label: 'Fruits',           tagline: 'Mango, Pineapple, Orange, Banana',    icon: Apple,   color: '#1A7A3F', tint: '#E6F6EC' },
  { id: 'leafy',   label: 'Leafy Vegetables', tagline: 'Lettuce, Cabbage, Spinach, Kontomire', icon: Leaf,    color: '#0E7A62', tint: '#E6F6F2' },
  { id: 'legumes', label: 'Legumes',          tagline: 'Cowpea, Groundnuts, Soybeans',        icon: Wheat,   color: '#7A5A2E', tint: '#F8F2EA' },
];

const NOTIFS = [
  { key: 'inApp' as const, label: 'In-App Notifications', desc: 'Alerts appear in the dashboard, recommended', icon: Bell,  color: '#1A65B5', tint: '#EBF3FD' },
  { key: 'email' as const, label: 'Email Alerts',         desc: 'Critical alerts sent to your inbox',          icon: Mail,  color: '#1A7A3F', tint: '#E6F6EC' },
  { key: 'sms'   as const, label: 'SMS Alerts',           desc: 'Text message for temperature breaches',       icon: Phone, color: '#C0501A', tint: '#FEF0E7' },
];

interface Props { onComplete: () => void; onSkip: () => void; }

// Step progress pills 
function StepPills({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5 items-center">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            width: i === step ? 28 : 8,
            opacity: i < step ? 0.35 : i === step ? 1 : 0.18,
            backgroundColor: '#1A65B5',
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          style={{ height: 6, borderRadius: 99 }}
        />
      ))}
    </div>
  );
}

//  Card row shared by both SelectionCard and ToggleCard 
function CardRow({
  active, color, tint, icon, title, subtitle, children, onClick,
}: {
  active: boolean; color: string; tint: string;
  icon: React.ElementType; title: string; subtitle: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      layout
      className="survey-card w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-left"
      style={{
        backgroundColor: active ? tint : '#FFFFFF',
        border: `1.5px solid ${active ? color + '55' : '#E8EAF0'}`,
        boxShadow: active ? `0 4px 18px ${color}1A` : '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'background-color 0.2s, border-color 0.2s, box-shadow 0.2s',
      }}
      whileTap={{ scale: 0.983 }}
    >
      {/* Icon container */}
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: active ? `${color}22` : '#F2F4F7',
          transition: 'background-color 0.2s',
        }}
      >
        <CardIcon icon={icon} color={color} active={active} />
      </div>

      <div className="flex-1 min-w-0 text-left">
        <p
          className="text-[13.5px] font-semibold leading-snug"
          style={{ color: active ? color : '#1A1F2E', transition: 'color 0.2s' }}
        >
          {title}
        </p>
        <p className="text-[11.5px] mt-0.5 leading-snug" style={{ color: '#8A92A3' }}>
          {subtitle}
        </p>
      </div>

      {children}
    </motion.button>
  );
}

// Radio select card
function SelectionCard(props: {
  active: boolean; color: string; tint: string;
  icon: React.ElementType; title: string; subtitle: string;
  onClick: () => void;
}) {
  return (
    <CardRow {...props}>
      <div
        className="w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center flex-shrink-0"
        style={{
          borderColor: props.active ? props.color : '#C8CDD8',
          backgroundColor: props.active ? props.color : 'transparent',
          transition: 'all 0.2s',
        }}
      >
        {props.active && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 600, damping: 28 }}
            className="w-[7px] h-[7px] rounded-full bg-white"
          />
        )}
      </div>
    </CardRow>
  );
}

// Toggle card with animated pill switch
function ToggleCard(props: {
  active: boolean; color: string; tint: string;
  icon: React.ElementType; title: string; subtitle: string;
  onToggle: () => void;
}) {
  const { active, color, tint, icon, title, subtitle, onToggle } = props;
  return (
    <CardRow active={active} color={color} tint={tint} icon={icon} title={title} subtitle={subtitle} onClick={onToggle}>
      {/* Switch pill */}
      <div
        className="relative flex-shrink-0"
        style={{
          width: 38, height: 22, borderRadius: 99,
          backgroundColor: active ? color : '#C8CDD8',
          transition: 'background-color 0.25s',
        }}
      >
        <motion.div
          animate={{ x: active ? 18 : 3 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          style={{
            position: 'absolute', top: 3,
            width: 16, height: 16, borderRadius: '50%',
            backgroundColor: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      </div>
    </CardRow>
  );
}

// ── Animation variants (module-level — not recreated every render) 
const slideVariants = {
  enter: (d: number) => ({ opacity: 0, x: d * 32 }),
  center:               { opacity: 1, x: 0 },
  exit:  (d: number) => ({ opacity: 0, x: d * -32 }),
};

// Main component 
export default function SetupSurvey({ onComplete, onSkip }: Props) {
  const { user, completeSurvey, settings } = useApp();
  const [step,      setStep]      = useState(0);
  const [role,      setRole]      = useState<UserRole | null>(null);
  const [produce,   setProduce]   = useState<ProduceMode>('mixed');
  const [dir,       setDir]       = useState<1 | -1>(1);
  const [inApp,     setInApp]     = useState(settings.inAppNotifications);
  const [email,     setEmail]     = useState(settings.emailAlerts);
  const [sms,       setSms]       = useState(settings.smsAlerts);
  const [notifEmail, setNotifEmail] = useState('');

  const wantsEmailStep = role === 'warehouse_manager' || role === 'transporter';
  // Lock TOTAL once the user advances past step 0 — prevents pills and button
  // from jumping mid-survey if they go back and change role.
  const [lockedEmailStep, setLockedEmailStep] = useState(false);
  const TOTAL = lockedEmailStep ? 4 : wantsEmailStep ? 4 : 3;

  const go = (n: number, d: 1 | -1) => {
    // Lock the email step decision the moment user leaves step 0 forward
    if (step === 0 && n === 1) setLockedEmailStep(wantsEmailStep);
    // Allow unlocking if they go all the way back to step 0 and re-choose
    if (n === 0) setLockedEmailStep(false);
    setDir(d); setStep(n);
  };

  const finish = () => {
    completeSurvey(
      role ?? 'other', produce,
      { inAppNotifications: inApp, emailAlerts: email, smsAlerts: sms },
      notifEmail.trim() || undefined,
    );
    onComplete();
  };

  const meta = [
    { title: "What's your role?",        sub: "Helps us personalise the dashboard for how you work." },
    { title: "What do you store?",       sub: "We'll dial in the right temperature and humidity targets." },
    { title: "How should we alert you?", sub: "Choose how to be notified when something goes wrong." },
    { title: "Link your alert email",    sub: role === 'transporter'
        ? "Get notified of temperature breaches in transit, even when the app is closed."
        : "Receive critical alerts straight to your inbox — useful when you're away from the facility." },
  ];

  return (
    // Warm off-white — intentionally "paper-like", not sterile blue
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#FAFAF8' }}>

      {/* ── Nav bar ── */}
      <div className="flex items-center justify-between px-5 pt-10 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: '#EBF3FD', border: '1px solid #C0D8F5' }}
          >
            <Snowflake className="w-4 h-4" style={{ color: '#1A65B5' }} />
          </div>
          <span className="text-sm font-semibold tracking-tight" style={{ color: '#1A1F2E' }}>
            ColdWatch
          </span>
        </div>
        {step < 3 && (
          <button
            onClick={onSkip}
            className="text-sm font-medium px-3 py-1.5 rounded-lg active:bg-black/5 transition-colors"
            style={{ color: '#A0A8B5' }}
          >
            Skip for now
          </button>
        )}
      </div>

      {/* ── Header block ── */}
      <div className="px-5 pt-4 pb-0 flex-shrink-0">
        <StepPills step={step} total={TOTAL} />

        <AnimatePresence mode="wait">
          <motion.div
            key={`h-${step}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="mt-5"
          >
            {/* Subtle step counter */}
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: '#A0A8B5' }}>
              {step + 1} / {TOTAL}
            </p>

            <h1 className="text-[26px] font-bold leading-tight" style={{ color: '#1A1F2E', letterSpacing: '-0.4px' }}>
              {meta[step].title}
            </h1>
            <p className="text-sm mt-1.5 leading-relaxed" style={{ color: '#6B7280' }}>
              {meta[step].sub}
            </p>

            {/* Warm greeting — personal, not corporate. Step 0 only. */}
            {step === 0 && (
              <p className="text-sm mt-2" style={{ color: '#A0A8B5' }}>
                Hey <span className="font-semibold" style={{ color: '#1A1F2E' }}>{user.name.split(' ')[0]}</span>,
                this takes about 30 seconds.
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Step cards (scrollable) ── */}
      <div className="flex-1 overflow-y-auto px-5 pt-5">
        <AnimatePresence mode="wait" custom={dir}>

          {/* Step 0 — Role */}
          {step === 0 && (
            <motion.div
              key="s0"
              custom={dir}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-2.5 pb-8"
            >
              {ROLES.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.055, duration: 0.22 }}
                >
                  <SelectionCard
                    active={role === r.id}
                    color={r.color} tint={r.tint}
                    icon={r.icon} title={r.label} subtitle={r.description}
                    onClick={() => setRole(r.id)}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Step 1 — Produce */}
          {step === 1 && (
            <motion.div
              key="s1"
              custom={dir}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-2.5 pb-8"
            >
              {PRODUCE.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.22 }}
                >
                  <SelectionCard
                    active={produce === p.id}
                    color={p.color} tint={p.tint}
                    icon={p.icon} title={p.label} subtitle={p.tagline}
                    onClick={() => setProduce(p.id)}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Step 2 — Notifications */}
          {step === 2 && (
            <motion.div
              key="s2"
              custom={dir}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-2.5 pb-8"
            >
              {/* Role consequence message */}
              {role && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22 }}
                  className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-1"
                  style={{
                    backgroundColor: role === 'warehouse_manager' ? 'rgba(9,132,227,0.06)' : 'rgba(39,174,96,0.06)',
                    border: `1px solid ${role === 'warehouse_manager' ? 'rgba(9,132,227,0.2)' : 'rgba(39,174,96,0.2)'}`,
                  }}
                >
                  <p className="text-xs leading-relaxed" style={{ color: role === 'warehouse_manager' ? '#1A65B5' : '#166534' }}>
                    {role === 'warehouse_manager'
                      ? 'You\'ll have full access to device calibration, global thresholds, data export, and advanced controls.'
                      : 'Your dashboard will stay focused on what matters: live readings, alerts, and your produce profile. Advanced settings are always one tap away.'}
                  </p>
                </motion.div>
              )}
              {NOTIFS.map((n, i) => (
                <motion.div
                  key={n.key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.22 }}
                >
                  <ToggleCard
                    active={n.key === 'inApp' ? inApp : n.key === 'email' ? email : sms}
                    color={n.color} tint={n.tint}
                    icon={n.icon} title={n.label} subtitle={n.desc}
                    onToggle={() => {
                      if (n.key === 'inApp') setInApp(v => !v);
                      if (n.key === 'email') setEmail(v => !v);
                      if (n.key === 'sms')   setSms(v => !v);
                    }}
                  />
                </motion.div>
              ))}

              <AnimatePresence>
                {!inApp && !email && !sms && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="flex items-start gap-2.5 px-4 py-3 rounded-xl mt-1"
                      style={{ backgroundColor: '#FFF8F0', border: '1px solid #F5CBA7' }}
                    >
                      <BellOff className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#C0501A' }} />
                      <p className="text-xs leading-relaxed" style={{ color: '#7A3010' }}>
                        No alerts selected, you won't be notified of breaches.
                        You can change this in Settings anytime.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Step 3 — Alert email (warehouse managers + transporters only) */}
          {step === 3 && wantsEmailStep && (
            <motion.div
              key="s3"
              custom={dir}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-4 pb-8"
            >
              {/* Context note */}
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="flex items-start gap-2.5 px-4 py-3 rounded-xl"
                style={{ backgroundColor: '#EBF3FD', border: '1px solid #C0D8F5' }}
              >
                <Mail className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#1A65B5' }} />
                <p className="text-xs leading-relaxed" style={{ color: '#1A4A8A' }}>
                  This can be different from your login email — e.g. a shared facility address.
                  You can also add or change this later in <span className="font-semibold">Settings → Notifications</span>.
                </p>
              </motion.div>

              {/* Email input */}
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.22 }}
              >
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
                  Alert Email Address
                </label>
                <div
                  className="relative rounded-xl transition-all"
                  style={{ border: '1.5px solid #E4E7EC', backgroundColor: '#FFFFFF' }}
                >
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#9CA3AF' }} />
                  <input
                    type="email"
                    placeholder="alerts@yourfacility.com"
                    value={notifEmail}
                    onChange={e => setNotifEmail(e.target.value)}
                    className="w-full py-3.5 bg-transparent outline-none border-0 text-sm"
                    style={{ paddingLeft: 42, paddingRight: 16, color: '#111827' }}
                  />
                </div>
              </motion.div>

              {/* Skip hint */}
              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.22 }}
                className="text-xs text-center"
                style={{ color: '#A0A8B5' }}
              >
                Not ready?{' '}
                <button
                  onClick={finish}
                  className="font-semibold underline active:opacity-70"
                  style={{ color: '#6B7280' }}
                >
                  Skip for now
                </button>
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom nav ── */}
      <div
        className="flex-shrink-0 px-5 pb-10 pt-3 flex gap-2.5"
        style={{ borderTop: '1px solid #EBEBEA', backgroundColor: '#FAFAF8' }}
      >
        <AnimatePresence>
          {step > 0 && (
            <motion.button
              initial={{ opacity: 0, x: -10, width: 0 }}
              animate={{ opacity: 1, x: 0, width: 48 }}
              exit={{ opacity: 0, x: -10, width: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => go(step - 1, -1)}
              className="h-12 rounded-2xl flex items-center justify-center flex-shrink-0 active:opacity-70"
              style={{ backgroundColor: '#EBF3FD', border: '1.5px solid #C0D8F5' }}
            >
              <ChevronLeft className="w-5 h-5" style={{ color: '#1A65B5' }} />
            </motion.button>
          )}
        </AnimatePresence>

        <motion.button
          layout
          onClick={() => step < TOTAL - 1 ? go(step + 1, 1) : finish()}
          disabled={step === 0 && !role}
          className="flex-1 h-12 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-35"
          style={{ backgroundColor: '#1A65B5', boxShadow: '0 4px 18px rgba(26,101,181,0.28)' }}
          whileTap={{ scale: 0.97 }}
        >
          {step < TOTAL - 1 ? (
            <>Continue <ChevronRight className="w-4 h-4" /></>
          ) : (
            <>Finish setup <CheckCircle2 className="w-4 h-4" /></>
          )}
        </motion.button>
      </div>
    </div>
  );
}
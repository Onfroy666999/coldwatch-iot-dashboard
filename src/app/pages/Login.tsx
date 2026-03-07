import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Snowflake, Eye, EyeOff, ArrowLeft,
  User, Lock, AtSign, ShieldQuestion, CheckCircle2, ChevronRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

// ── Simple deterministic hash (local-only, not for production secrets) ────────
const hashString = (str: string) => btoa(unescape(encodeURIComponent(str + '_cw2024')));

// ── LocalStorage helpers ──────────────────────────────────────────────────────
export interface StoredUser {
  id: string; name: string; email?: string; passwordHash: string;
  avatar: string; securityQuestion: string; securityAnswerHash: string;
  createdAt: string;
}
export const getStoredUsers = (): StoredUser[] => {
  try { return JSON.parse(localStorage.getItem('cw_users') || '[]'); } catch { return []; }
};
const saveStoredUsers = (users: StoredUser[]) =>
  localStorage.setItem('cw_users', JSON.stringify(users));
export const saveSession = (user: StoredUser, remember: boolean) =>
  localStorage.setItem('cw_session', JSON.stringify({ userId: user.id, remember }));

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is the name of the town where you were born?",
  "What is your mother's maiden name?",
  "What was the name of your primary school?",
  "What was the make of your first car?",
];

// ── Palette — Light / Clean ───────────────────────────────────────────────────
// Page bg:     #F0F2F5  Cool light grey
// Card bg:     #FFFFFF  Pure white
// Border idle: #E4E7EC  Soft grey
// Focus:       #0984E3  Electric Blue
// Label:       #374151  Dark grey
// Muted:       #6B7280  Mid grey
// Placeholder: #9CA3AF  Light grey
// CTA:         #111827  Near black (matches mockup's black button)
// Error:       #DC2626  Standard red

// ── Light input ───────────────────────────────────────────────────────────────
function LightInput({
  icon: Icon, type = 'text', placeholder, value, onChange,
  autoComplete, autoFocus, rightSlot,
}: {
  icon: React.ElementType; type?: string; placeholder: string;
  value: string; onChange: (v: string) => void;
  autoComplete?: string; autoFocus?: boolean;
  rightSlot?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      className="relative rounded-xl transition-all duration-200"
      style={{
        border: `1.5px solid ${focused ? '#0984E3' : '#E4E7EC'}`,
        boxShadow: focused ? '0 0 0 3px rgba(9,132,227,0.1)' : 'none',
        backgroundColor: '#FFFFFF',
      }}
    >
      <Icon
        className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200"
        style={{ color: focused ? '#0984E3' : '#9CA3AF' }}
      />
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full py-3.5 bg-transparent outline-none border-0 focus:ring-0 text-sm"
        style={{ paddingLeft: 42, paddingRight: rightSlot ? 44 : 16, color: '#111827' }}
      />
      {rightSlot && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</div>
      )}
    </div>
  );
}

const labelClass = "block text-xs font-semibold text-[#374151] mb-1.5";

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="text-xs p-3 rounded-xl flex items-start gap-2"
      style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
      <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-1" />
      {msg}
    </div>
  );
}

// CTA button — near-black to match mockup's Login button
function PrimaryBtn({ loading, label, loadingLabel }: {
  loading: boolean; label: string; loadingLabel: string;
}) {
  return (
    <button type="submit" disabled={loading}
      className="w-full py-3.5 rounded-xl text-white text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-50"
      style={{ backgroundColor: '#111827', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
    >
      {loading
        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{loadingLabel}</>
        : <>{label}<ChevronRight className="w-4 h-4" /></>
      }
    </button>
  );
}

type View = 'signin' | 'signup' | 'forgot';

// ── Sign In ───────────────────────────────────────────────────────────────────
function SignInView({ onSwitch }: { onSwitch: (v: View) => void }) {
  const { login } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password,   setPassword]   = useState('');
  const [showPass,   setShowPass]   = useState(false);
  const [remember,   setRemember]   = useState(true);
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!identifier || !password) { setError('Please enter your name and password.'); return; }
    setLoading(true);
    setTimeout(() => {
      const users = getStoredUsers();
      // Match on name (case-insensitive) or email if they provided one
      const match = users.find(u =>
        (u.name.toLowerCase() === identifier.toLowerCase().trim() ||
         (u.email && u.email.toLowerCase() === identifier.toLowerCase().trim())) &&
        u.passwordHash === hashString(password)
      );
      if (match) {
        if (remember) saveSession(match, true);
        login(match.email || '', match.name, match.id, match.avatar);
      } else {
        const accountExists = users.find(u =>
          u.name.toLowerCase() === identifier.toLowerCase().trim() ||
          (u.email && u.email.toLowerCase() === identifier.toLowerCase().trim())
        );
        setError(accountExists
          ? 'Incorrect password. Try again or reset your password.'
          : 'No account found with that name. Please sign up.'
        );
        setLoading(false);
      }
    }, 600);
  };

  return (
    <>
      <h2 className="text-xl font-bold mb-0.5" style={{ color: '#111827' }}>Sign in</h2>
      <p className="text-sm mb-5" style={{ color: '#6B7280' }}>
        New user?{' '}
        <button onClick={() => onSwitch('signup')} className="font-semibold" style={{ color: '#0984E3' }}>
          Create an account
        </button>
      </p>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <LightInput icon={User} placeholder="Full name or email"
            value={identifier} onChange={setIdentifier} autoComplete="name" />
        </div>
        <div>
          <LightInput
            icon={Lock} type={showPass ? 'text' : 'password'}
            placeholder="Password" value={password} onChange={setPassword}
            autoComplete="current-password"
            rightSlot={
              <button type="button" onClick={() => setShowPass(v => !v)} style={{ color: '#9CA3AF' }}>
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
        </div>

        <button type="button" onClick={() => onSwitch('forgot')}
          className="text-xs font-medium block" style={{ color: '#6B7280' }}>
          Forgot password?
        </button>

        {error && <ErrorMsg msg={error} />}

        <PrimaryBtn loading={loading} label="Login" loadingLabel="Signing in…" />

        <label className="flex items-center gap-2 cursor-pointer select-none pt-1"
          onClick={() => setRemember(v => !v)}>
          <div
            className="w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0"
            style={{ borderColor: remember ? '#0984E3' : '#D1D5DB', backgroundColor: remember ? '#0984E3' : 'transparent' }}
          >
            {remember && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
          </div>
          <span className="text-xs" style={{ color: '#6B7280' }}>Remember me</span>
        </label>
      </form>
    </>
  );
}

// ── Sign Up ───────────────────────────────────────────────────────────────────
function SignUpView({ onSwitch, onSignedUp }: {
  onSwitch: (v: View) => void;
  onSignedUp?: (userId: string) => void;
}) {
  const { login } = useApp();
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPass, setShowPass] = useState(false);
  const [question, setQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [answer,   setAnswer]   = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!name.trim())        { setError('Please enter your full name.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (!answer.trim())      { setError('Please answer your security question.'); return; }

    const users = getStoredUsers();
    // Check name uniqueness — primary identifier for users without email
    if (users.find(u => u.name.toLowerCase() === name.toLowerCase().trim())) {
      setError('An account with this name already exists. Please sign in or use a different name.'); return;
    }
    // Only check email uniqueness if one was provided
    if (email.trim() && users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase().trim())) {
      setError('An account with this email already exists. Please sign in.'); return;
    }
    setLoading(true);
    setTimeout(() => {
      const initials = name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      const newUser: StoredUser = {
        id: `user_${Date.now()}`,
        name: name.trim(),
        ...(email.trim() ? { email: email.toLowerCase().trim() } : {}),
        passwordHash: hashString(password),
        avatar: initials,
        securityQuestion: question,
        securityAnswerHash: hashString(answer.toLowerCase().trim()),
        createdAt: new Date().toISOString(),
      };
      saveStoredUsers([...users, newUser]);
      saveSession(newUser, true);
      login(newUser.email || '', newUser.name, newUser.id, newUser.avatar);
      if (onSignedUp) onSignedUp(newUser.id);
    }, 700);
  };

  const strength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
  const strengthColors = ['', '#DC2626', '#D97706', '#16A34A'];
  const strengthLabels = ['', 'Too short', 'Fair', 'Strong'];

  return (
    <>
      <button onClick={() => onSwitch('signin')}
        className="flex items-center gap-1.5 text-xs font-medium mb-4 active:opacity-70"
        style={{ color: '#6B7280' }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
      </button>

      <h2 className="text-xl font-bold mb-0.5" style={{ color: '#111827' }}>Create account</h2>
      <p className="text-sm mb-5" style={{ color: '#6B7280' }}>Set up your ColdWatch profile</p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className={labelClass}>Full Name</label>
          <LightInput icon={User} placeholder="Kwame Mensah" value={name} onChange={setName} autoComplete="name" />
        </div>
        <div>
          <label className={labelClass}>Email Address <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span></label>
          <LightInput icon={AtSign} type="email" placeholder="your.email@example.com"
            value={email} onChange={setEmail} autoComplete="email" />
          <p className="text-[11px] mt-1" style={{ color: '#9CA3AF' }}>
            Only needed if you want to receive alert emails later.
          </p>
        </div>
        <div>
          <label className={labelClass}>Password</label>
          <LightInput
            icon={Lock} type={showPass ? 'text' : 'password'}
            placeholder="Min. 6 characters" value={password} onChange={setPassword}
            autoComplete="new-password"
            rightSlot={
              <button type="button" onClick={() => setShowPass(v => !v)} style={{ color: '#9CA3AF' }}>
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
          {password.length > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#E4E7EC' }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${(strength / 3) * 100}%`, backgroundColor: strengthColors[strength] }} />
              </div>
              <span className="text-[11px] font-semibold" style={{ color: strengthColors[strength] }}>
                {strengthLabels[strength]}
              </span>
            </div>
          )}
        </div>
        <div>
          <label className={labelClass}>Confirm Password</label>
          <div className="relative">
            <LightInput icon={Lock} type="password" placeholder="Repeat your password"
              value={confirm} onChange={setConfirm} autoComplete="new-password" />
            {confirm.length > 0 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center"
                style={{ backgroundColor: password === confirm ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.1)' }}>
                <div className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: password === confirm ? '#16A34A' : '#DC2626' }} />
              </div>
            )}
          </div>
        </div>

        {/* Password recovery */}
        <div className="pt-2.5" style={{ borderTop: '1px solid #F3F4F6' }}>
          <div className="flex items-center gap-1.5 mb-2.5">
            <ShieldQuestion className="w-3.5 h-3.5" style={{ color: '#0984E3' }} />
            <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: '#0984E3' }}>
              Password Recovery
            </p>
          </div>
          <div className="space-y-2.5">
            <div>
              <label className={labelClass}>Security Question</label>
              <select value={question} onChange={e => setQuestion(e.target.value)}
                className="w-full py-3.5 px-3.5 rounded-xl text-sm outline-none cursor-pointer"
                style={{
                  backgroundColor: '#FFFFFF', border: '1.5px solid #E4E7EC',
                  color: '#111827', fontSize: 14,
                }}>
                {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Your Answer</label>
              <LightInput icon={Lock} placeholder="Answer (not case-sensitive)"
                value={answer} onChange={setAnswer} />
              <p className="text-[11px] mt-1" style={{ color: '#9CA3AF' }}>
                Used to reset your password if you forget it.
              </p>
            </div>
          </div>
        </div>

        {error && <ErrorMsg msg={error} />}

        <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl"
          style={{ backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE' }}>
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: '#0984E3' }} />
          <p className="text-[11px] leading-relaxed" style={{ color: '#1D4ED8' }}>
            Your account is stored <span className="font-bold">on this device only</span>. No data is sent to any server.
          </p>
        </div>

        <PrimaryBtn loading={loading} label="Create Account" loadingLabel="Creating account…" />
      </form>
    </>
  );
}

// ── Forgot Password ───────────────────────────────────────────────────────────
type ResetStep = 'email' | 'question' | 'newpass' | 'done';

function ForgotView({ onSwitch }: { onSwitch: (v: View) => void }) {
  const [step,        setStep]        = useState<ResetStep>('email');
  const [identifier,  setIdentifier]  = useState('');
  const [answer,      setAnswer]      = useState('');
  const [newPass,     setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [error,       setError]       = useState('');
  const [foundUser,   setFoundUser]   = useState<StoredUser | null>(null);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    const user = getStoredUsers().find(u =>
      u.name.toLowerCase() === identifier.toLowerCase().trim() ||
      (u.email && u.email.toLowerCase() === identifier.toLowerCase().trim())
    );
    if (!user) { setError('No account found with that name or email.'); return; }
    setFoundUser(user); setStep('question');
  };

  const handleAnswerSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!foundUser) return;
    if (hashString(answer.toLowerCase().trim()) !== foundUser.securityAnswerHash) {
      setError('Incorrect answer. Please try again.'); return;
    }
    setStep('newpass');
  };

  const handleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (newPass.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (newPass !== confirmPass) { setError('Passwords do not match.'); return; }
    saveStoredUsers(
      getStoredUsers().map(u =>
        u.id === foundUser!.id ? { ...u, passwordHash: hashString(newPass) } : u
      )
    );
    setStep('done');
  };

  const stepOrder: ResetStep[] = ['email', 'question', 'newpass'];
  const stepIdx = stepOrder.indexOf(step as ResetStep);

  return (
    <>
      <button onClick={() => onSwitch('signin')}
        className="flex items-center gap-1.5 text-xs font-medium mb-4 active:opacity-70"
        style={{ color: '#6B7280' }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
      </button>

      <h2 className="text-xl font-bold mb-4" style={{ color: '#111827' }}>Reset Password</h2>

      {step !== 'done' && (
        <div className="flex items-center gap-2 mb-5">
          {stepOrder.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
                style={{
                  backgroundColor: stepIdx > i ? '#0984E3' : stepIdx === i ? '#EFF6FF' : '#F3F4F6',
                  color:           stepIdx > i ? '#fff'    : stepIdx === i ? '#0984E3' : '#9CA3AF',
                  border:          stepIdx === i ? '1.5px solid #0984E3' : 'none',
                }}
              >{i + 1}</div>
              {i < 2 && (
                <div className="w-8 h-px rounded"
                  style={{ backgroundColor: stepIdx > i ? '#0984E3' : '#E4E7EC' }} />
              )}
            </div>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === 'email' && (
          <motion.form key="email"
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }} onSubmit={handleEmailSubmit} className="space-y-4">
            <p className="text-sm" style={{ color: '#6B7280' }}>
              Enter the name or email address linked to your account.
            </p>
            <div>
              <label className={labelClass}>Full Name or Email</label>
              <LightInput icon={User} placeholder="Kwame Mensah or your.email@example.com"
                value={identifier} onChange={setIdentifier} autoFocus />
            </div>
            {error && <ErrorMsg msg={error} />}
            <PrimaryBtn loading={false} label="Continue" loadingLabel="" />
          </motion.form>
        )}

        {step === 'question' && foundUser && (
          <motion.form key="question"
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }} onSubmit={handleAnswerSubmit} className="space-y-4">
            <div className="px-3.5 py-3 rounded-xl text-sm font-medium"
              style={{ backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE', color: '#1D4ED8' }}>
              {foundUser.securityQuestion}
            </div>
            <div>
              <label className={labelClass}>Your Answer</label>
              <LightInput icon={Lock} placeholder="Answer (not case-sensitive)"
                value={answer} onChange={setAnswer} autoFocus />
            </div>
            {error && <ErrorMsg msg={error} />}
            <PrimaryBtn loading={false} label="Verify Answer" loadingLabel="" />
          </motion.form>
        )}

        {step === 'newpass' && (
          <motion.form key="newpass"
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }} onSubmit={handleResetSubmit} className="space-y-4">
            <p className="text-sm" style={{ color: '#6B7280' }}>Choose a new password for your account.</p>
            <div>
              <label className={labelClass}>New Password</label>
              <LightInput
                icon={Lock} type={showPass ? 'text' : 'password'}
                placeholder="Min. 6 characters" value={newPass} onChange={setNewPass} autoFocus
                rightSlot={
                  <button type="button" onClick={() => setShowPass(v => !v)} style={{ color: '#9CA3AF' }}>
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
            </div>
            <div>
              <label className={labelClass}>Confirm New Password</label>
              <LightInput icon={Lock} type="password" placeholder="Repeat new password"
                value={confirmPass} onChange={setConfirmPass} />
            </div>
            {error && <ErrorMsg msg={error} />}
            <PrimaryBtn loading={false} label="Reset Password" loadingLabel="" />
          </motion.form>
        )}

        {step === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="text-center py-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
              <CheckCircle2 className="w-8 h-8" style={{ color: '#16A34A' }} />
            </div>
            <p className="font-bold mb-1" style={{ color: '#111827' }}>Password reset!</p>
            <p className="text-sm mb-6" style={{ color: '#6B7280' }}>
              You can now sign in with your new password.
            </p>
            <button onClick={() => onSwitch('signin')}
              className="w-full py-3.5 rounded-xl text-white text-sm font-bold active:scale-[0.98]"
              style={{ backgroundColor: '#111827' }}>
              Back to Sign In
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Root Login Page ───────────────────────────────────────────────────────────
export default function Login({ onSignedUp }: { onSignedUp?: (userId: string) => void }) {
  const [view, setView] = useState<View>('signin');

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ backgroundColor: '#F0F2F5' }}
    >
      <div className="w-full max-w-sm">

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center mb-6"
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
            style={{ backgroundColor: '#0984E3', boxShadow: '0 4px 14px rgba(9,132,227,0.3)' }}
          >
            <Snowflake className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: '#111827' }}>ColdWatch</h1>
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase mt-0.5"
            style={{ color: '#9CA3AF' }}>
            IoT Cold Chain Monitor
          </p>
        </motion.div>

        {/* Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="rounded-2xl p-6"
            style={{
              backgroundColor: '#FFFFFF',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.05)',
              border: '1px solid #F3F4F6',
            }}
          >
            {view === 'signin' && <SignInView onSwitch={setView} />}
            {view === 'signup' && <SignUpView onSwitch={setView} onSignedUp={onSignedUp} />}
            {view === 'forgot' && <ForgotView onSwitch={setView} />}
          </motion.div>
        </AnimatePresence>

        {/* Terms */}
        <p className="text-center text-[11px] mt-4 leading-relaxed" style={{ color: '#9CA3AF' }}>
          By signing in with an account, you agree to ColdWatch's{' '}
          <span className="underline cursor-pointer">Terms of Service</span>{' '}
          and{' '}
          <span className="underline cursor-pointer">Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}
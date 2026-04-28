import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Snowflake, Eye, EyeOff, ArrowLeft,
  User, Lock, Phone, AtSign, CheckCircle2, ChevronRight,
} from 'lucide-react';
import { useApp }   from '../context/AppContext';
import { authApi }  from '../Lib/api';

// ── Shared UI primitives ──────────────────────────────────────────────────────

function LightInput({
  icon: Icon, type = 'text', placeholder, value, onChange,
  autoComplete, autoFocus, rightSlot, inputMode,
}: {
  icon: React.ElementType; type?: string; placeholder: string;
  value: string; onChange: (v: string) => void;
  autoComplete?: string; autoFocus?: boolean; rightSlot?: React.ReactNode;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative rounded-xl transition-all duration-200"
      style={{
        border: `1.5px solid ${focused ? '#0984E3' : '#E4E7EC'}`,
        boxShadow: focused ? '0 0 0 3px rgba(9,132,227,0.1)' : 'none',
        backgroundColor: '#FFFFFF',
      }}>
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200"
        style={{ color: focused ? '#0984E3' : '#9CA3AF' }} />
      <input
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full py-3.5 bg-transparent outline-none border-0 focus:ring-0"
        // 16px minimum — prevents iOS Safari auto-zoom on input focus
        style={{ paddingLeft: 42, paddingRight: rightSlot ? 44 : 16, color: '#111827', fontSize: 16 }}
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

function PrimaryBtn({ loading, label, loadingLabel, disabled }: {
  loading: boolean; label: string; loadingLabel: string; disabled?: boolean;
}) {
  return (
    <button type="submit" disabled={loading || disabled}
      className="w-full py-3.5 rounded-xl text-white font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-50"
      style={{ backgroundColor: '#111827', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: 16 }}>
      {loading
        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{loadingLabel}</>
        : <>{label}<ChevronRight className="w-4 h-4" /></>
      }
    </button>
  );
}

type View = 'signin' | 'signup' | 'forgot';

// ── Step progress indicator ───────────────────────────────────────────────────
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
            style={{
              backgroundColor: current > i ? '#0984E3' : current === i ? '#EFF6FF' : '#F3F4F6',
              color:           current > i ? '#fff'    : current === i ? '#0984E3' : '#9CA3AF',
              border:          current === i ? '1.5px solid #0984E3' : 'none',
            }}>{i + 1}</div>
          {i < total - 1 && (
            <div className="w-8 h-px rounded" style={{ backgroundColor: current > i ? '#0984E3' : '#E4E7EC' }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Sign In ───────────────────────────────────────────────────────────────────
function SignInView({ onSwitch }: { onSwitch: (v: View) => void }) {
  const { login } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password,   setPassword]   = useState('');
  const [showPass,   setShowPass]   = useState(false);
  const [remember,   setRemember]   = useState(true);
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim()) { setError('Please enter your email or phone number.'); return; }
    if (!password)           { setError('Please enter your password.'); return; }
    setLoading(true);
    try {
      const { user, token } = await authApi.login({ identifier: identifier.trim(), password });
      login(user.email ?? user.phone ?? '', user.name, user.id, user.username ?? '');
    } catch (err: any) {
      const status = err?.status ?? 0;
      if (status === 401) setError('Incorrect email/phone or password. Please try again.');
      else if (!navigator.onLine) setError('No internet connection. Check your connection and try again.');
      else setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
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
          <label className={labelClass}>Email or Phone Number</label>
          <LightInput icon={Phone} placeholder="your.email@example.com or 0244123456"
            value={identifier} onChange={setIdentifier}
            autoComplete="username" inputMode="email" />
        </div>
        <div>
          <LightInput icon={Lock} type={showPass ? 'text' : 'password'}
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

        <PrimaryBtn loading={loading} label="Sign In" loadingLabel="Signing in…" />

        <label className="flex items-center gap-2 cursor-pointer select-none pt-1"
          onClick={() => setRemember(v => !v)}>
          <div className="w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0"
            style={{ borderColor: remember ? '#0984E3' : '#D1D5DB', backgroundColor: remember ? '#0984E3' : 'transparent' }}>
            {remember && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
          </div>
          <span className="text-xs" style={{ color: '#6B7280' }}>Remember me</span>
        </label>
      </form>
    </>
  );
}

// ── Sign Up ───────────────────────────────────────────────────────────────────
function SignUpView({ onSwitch, onSignedUp }: { onSwitch: (v: View) => void; onSignedUp?: (userId: string) => void }) {
  const { login } = useApp();
  const [name,       setName]       = useState('');
  const [email,      setEmail]      = useState('');
  const [phone,      setPhone]      = useState('');
  const [password,   setPassword]   = useState('');
  const [confirm,    setConfirm]    = useState('');
  const [showPass,   setShowPass]   = useState(false);
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim())           { setError('Please enter your full name.'); return; }
    if (!email.trim() && !phone.trim()) { setError('Please provide at least an email address or phone number.'); return; }
    if (password.length < 8)    { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm)    { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const { user } = await authApi.signup({
        name:     name.trim(),
        email:    email.trim() || undefined,
        phone:    phone.trim() || undefined,
        password,
        role:     'farmer',
      });
      login(user.email ?? user.phone ?? '', user.name, user.id, user.username ?? '');
      // Trigger survey — new users must complete it before reaching the dashboard
      onSignedUp?.(user.id);
    } catch (err: any) {
      const status = err?.status ?? 0;
      if (status === 409) setError(err?.message ?? 'An account with this email or phone already exists.');
      else if (!navigator.onLine) setError('No internet connection. Try again.');
      else setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const strength = password.length === 0 ? 0 : password.length < 8 ? 1 : password.length < 12 ? 2 : 3;
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

        {/* Contact info — need at least one */}
        <div className="p-3.5 rounded-xl space-y-3"
          style={{ backgroundColor: '#F8FAFC', border: '1px solid #E4E7EC' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#6B7280' }}>
            Contact Info <span className="font-normal normal-case tracking-normal">(at least one required)</span>
          </p>
          <div>
            <label className={labelClass}>Email Address</label>
            <LightInput icon={AtSign} type="email" placeholder="your.email@example.com"
              value={email} onChange={setEmail} autoComplete="email" />
            <p className="text-[11px] mt-1" style={{ color: '#9CA3AF' }}>Needed to receive alert emails.</p>
          </div>
          <div>
            <label className={labelClass}>Phone Number</label>
            <LightInput icon={Phone} placeholder="0244 123 456" value={phone} onChange={setPhone}
              autoComplete="tel" inputMode="tel" />
            <p className="text-[11px] mt-1" style={{ color: '#9CA3AF' }}>
              Ghana number (MTN, Vodafone, AirtelTigo). Used for SMS alerts and password reset.
            </p>
          </div>
        </div>

        <div>
          <label className={labelClass}>Password</label>
          <LightInput icon={Lock} type={showPass ? 'text' : 'password'}
            placeholder="Min. 8 characters" value={password} onChange={setPassword}
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

        {error && <ErrorMsg msg={error} />}

        <PrimaryBtn loading={loading} label="Create Account" loadingLabel="Creating account…" />
      </form>
    </>
  );
}

// ── Forgot Password — 3-step OTP wizard ──────────────────────────────────────
type ResetStep = 'contact' | 'otp' | 'newpass' | 'done';

function ForgotView({ onSwitch }: { onSwitch: (v: View) => void }) {
  const [step,       setStep]       = useState<ResetStep>('contact');
  const [identifier, setIdentifier] = useState('');
  const [via,        setVia]        = useState<'sms' | 'email' | null>(null);
  const [otp,        setOtp]        = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [newPass,    setNewPass]    = useState('');
  const [confirmPass,setConfirmPass]= useState('');
  const [showPass,   setShowPass]   = useState(false);
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ── Step 1: request OTP ───────────────────────────────────────────────────
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim()) { setError('Please enter your email or phone number.'); return; }
    setLoading(true);
    try {
      const res = await authApi.requestOtp(identifier.trim());
      setVia(res.via);
      setStep('otp');
      setResendCooldown(60);
    } catch {
      setError('Cannot connect to server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── OTP input box logic ───────────────────────────────────────────────────
  const handleOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next  = [...otp];
    next[i] = digit;
    setOtp(next);
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      otpRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  // ── Step 2: verify OTP ────────────────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const code = otp.join('');
    if (code.length < 6) { setError('Please enter all 6 digits of your reset code.'); return; }
    setLoading(true);
    try {
      const { resetToken: tok } = await authApi.verifyOtp(identifier.trim(), code);
      setResetToken(tok);
      setStep('newpass');
    } catch (err: any) {
      const status = err?.status ?? 0;
      if (status === 401) setError(err?.message ?? 'Incorrect code. Please try again.');
      else setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: set new password ──────────────────────────────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPass.length < 8)      { setError('Password must be at least 8 characters.'); return; }
    if (newPass !== confirmPass)  { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await authApi.resetPassword(resetToken, newPass);
      setStep('done');
    } catch (err: any) {
      if (err?.status === 401) {
        setError('Your reset session expired. Please start over.');
        setStep('contact');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError('');
    try {
      const res = await authApi.requestOtp(identifier.trim());
      setVia(res.via);
      setOtp(['', '', '', '', '', '']);
      setResendCooldown(60);
      otpRefs.current[0]?.focus();
    } catch {
      setError('Failed to resend. Check your connection.');
    }
  };

  const stepOrder: ResetStep[] = ['contact', 'otp', 'newpass'];
  const stepIdx = stepOrder.indexOf(step as ResetStep);

  return (
    <>
      <button onClick={() => onSwitch('signin')}
        className="flex items-center gap-1.5 text-xs font-medium mb-4 active:opacity-70"
        style={{ color: '#6B7280' }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
      </button>

      <h2 className="text-xl font-bold mb-4" style={{ color: '#111827' }}>Reset Password</h2>

      {step !== 'done' && <StepDots total={3} current={stepIdx} />}

      <AnimatePresence mode="wait">

        {/* Step 1 — Enter email or phone */}
        {step === 'contact' && (
          <motion.form key="contact"
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }} onSubmit={handleRequestOtp} className="space-y-4">
            <p className="text-sm" style={{ color: '#6B7280' }}>
              Enter the email address or phone number linked to your account. We'll send you a 6-digit reset code.
            </p>
            <div>
              <label className={labelClass}>Email or Phone Number</label>
              <LightInput icon={Phone} placeholder="your.email@example.com or 0244123456"
                value={identifier} onChange={setIdentifier} autoFocus inputMode="email" />
            </div>
            {error && <ErrorMsg msg={error} />}
            <PrimaryBtn loading={loading} label="Send Reset Code" loadingLabel="Sending…" />
          </motion.form>
        )}

        {/* Step 2 — Enter OTP */}
        {step === 'otp' && (
          <motion.form key="otp"
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }} onSubmit={handleVerifyOtp} className="space-y-4">
            <p className="text-sm" style={{ color: '#6B7280' }}>
              A 6-digit code was sent to your{' '}
              <span className="font-semibold" style={{ color: '#111827' }}>
                {via === 'sms' ? 'phone number' : 'email address'}
              </span>
              . Enter it below.
            </p>

            {/* OTP boxes — grid keeps boxes within card bounds */}
            <div className="grid grid-cols-6 gap-2" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(i, e)}
                  autoFocus={i === 0}
                  className="w-full text-center font-bold rounded-xl outline-none border-2 transition-all"
                  style={{
                    height: 52,
                    fontSize: 22,
                    borderColor: digit ? '#0984E3' : '#E4E7EC',
                    backgroundColor: digit ? '#EFF6FF' : '#FAFAFA',
                    color: '#111827',
                    minWidth: 0, // prevents grid blowout
                  }}
                />
              ))}
            </div>

            <button type="button" onClick={handleResend} disabled={resendCooldown > 0}
              className="text-xs font-medium w-full text-center disabled:opacity-40"
              style={{ color: '#0984E3' }}>
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Didn't receive it? Resend code"}
            </button>

            {error && <ErrorMsg msg={error} />}
            <PrimaryBtn loading={loading} label="Verify Code" loadingLabel="Verifying…"
              disabled={otp.join('').length < 6} />
          </motion.form>
        )}

        {/* Step 3 — New password */}
        {step === 'newpass' && (
          <motion.form key="newpass"
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }} onSubmit={handleResetPassword} className="space-y-4">
            <p className="text-sm" style={{ color: '#6B7280' }}>
              Choose a new password for your account.
            </p>
            <div>
              <label className={labelClass}>New Password</label>
              <LightInput icon={Lock} type={showPass ? 'text' : 'password'}
                placeholder="Min. 8 characters" value={newPass} onChange={setNewPass}
                autoComplete="new-password" autoFocus
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
                value={confirmPass} onChange={setConfirmPass} autoComplete="new-password" />
            </div>
            {error && <ErrorMsg msg={error} />}
            <PrimaryBtn loading={loading} label="Reset Password" loadingLabel="Resetting…" />
          </motion.form>
        )}

        {/* Done */}
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
              className="w-full py-3.5 rounded-xl text-white font-bold active:scale-[0.98]"
              style={{ backgroundColor: '#111827', fontSize: 16 }}>
              Sign In
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function Login({ onSignedUp }: { onSignedUp?: (userId: string) => void }) {
  const [view, setView] = useState<View>('signin');

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ backgroundColor: '#F0F2F5' }}>
      <div className="w-full max-w-sm">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }} className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
            style={{ backgroundColor: '#0984E3', boxShadow: '0 4px 14px rgba(9,132,227,0.3)' }}>
            <Snowflake className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: '#111827' }}>ColdWatch</h1>
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase mt-0.5" style={{ color: '#9CA3AF' }}>
            IoT Cold Chain Monitor
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div key={view}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="rounded-2xl p-6"
            style={{
              backgroundColor: '#FFFFFF',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.05)',
              border: '1px solid #F3F4F6',
            }}>
            {view === 'signin' && <SignInView onSwitch={setView} />}
            {view === 'signup' && <SignUpView onSwitch={setView} onSignedUp={onSignedUp} />}
            {view === 'forgot' && <ForgotView onSwitch={setView} />}
          </motion.div>
        </AnimatePresence>

        <p className="text-center text-[11px] mt-4 leading-relaxed" style={{ color: '#9CA3AF' }}>
          By signing in you agree to ColdWatch's{' '}
          <span className="underline cursor-pointer">Terms of Service</span>{' '}
          and <span className="underline cursor-pointer">Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}
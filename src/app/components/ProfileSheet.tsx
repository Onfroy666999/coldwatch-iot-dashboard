import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, User, Mail, Lock, LogOut, Eye, EyeOff, CheckCircle2, Save, ShieldCheck, Store, Warehouse, UserCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { UserRole } from '../context/AppContext';

const hashString = (str: string) => btoa(unescape(encodeURIComponent(str + '_cw2024')));

const ROLE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  farmer:            { label: 'Farmer',   color: '#C0501A', bg: 'rgba(192,80,26,0.08)'   },
  warehouse_manager: { label: 'Warehouse Manager', color: '#1A65B5', bg: 'rgba(26,101,181,0.08)'  },
  transporter:       { label: 'Transporter',       color: '#0E7A62', bg: 'rgba(14,122,98,0.08)'   },
  other:             { label: 'User',              color: '#5D6470', bg: 'rgba(93,100,112,0.08)'  },
};

const ROLE_OPTIONS: { id: UserRole; label: string; icon: React.ElementType; color: string; tint: string }[] = [
  { id: 'farmer',            label: 'Farmer',   icon: Store,       color: '#C0501A', tint: '#FEF0E7' },
  { id: 'warehouse_manager', label: 'Warehouse Manager', icon: Warehouse,   color: '#1A65B5', tint: '#EBF3FD' },
  { id: 'other',             label: 'Other',             icon: UserCircle,  color: '#5D6470', tint: '#F1F2F4' },
];

interface Props { onClose: () => void; }
type Tab = 'profile' | 'password';

export default function ProfileSheet({ onClose }: Props) {
  const { user, updateUser, logout, addToast } = useApp();

  const [tab,        setTab]        = useState<Tab>('profile');
  const [name,       setName]       = useState(user.name);
  const [email,      setEmail]      = useState(user.email);
  const [profilePic, setProfilePic] = useState(user.profilePicture || '');
  const [role,       setRole]       = useState<UserRole>((user.role as UserRole) || 'other');
  const [saving,     setSaving]     = useState(false);

  // roleStyle reflects the pending local selection so the badge previews the change
  const roleStyle = ROLE_LABELS[role] ?? ROLE_LABELS.other;

  const [currentPass, setCurrentPass] = useState('');
  const [newPass,     setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [passError,   setPassError]   = useState('');
  const [savingPass,  setSavingPass]  = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const isProfileDirty = name.trim() !== user.name || email.trim() !== user.email || profilePic !== (user.profilePicture || '') || role !== (user.role || 'other');

  // ── Lock body scroll while sheet is open ──────────────────────────────────
  // Critical on iOS: the fixed app container (App.tsx) has overflow-y-auto on
  // <main>, which intercepts touch scroll events before they reach the sheet.
  // Locking overflow here forces iOS to route scroll gestures to the sheet instead.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      addToast({ id: `t-${Date.now()}`, type: 'error', message: 'Photo must be under 2MB' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProfilePic(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = () => {
    if (!name.trim()) return;
    setSaving(true);
    setTimeout(() => {
      updateUser({ name: name.trim(), email: email.trim(), profilePicture: profilePic, role });
      addToast({ id: `t-${Date.now()}`, type: 'success', message: 'Profile updated' });
      setSaving(false);
    }, 500);
  };

  const handleChangePassword = () => {
    setPassError('');
    if (!currentPass)            { setPassError('Enter your current password.'); return; }
    if (newPass.length < 6)      { setPassError('New password must be at least 6 characters.'); return; }
    if (newPass !== confirmPass) { setPassError('Passwords do not match.'); return; }
    try {
      const users  = JSON.parse(localStorage.getItem('cw_users') || '[]');
      const stored = users.find((u: any) => u.id === user.id);
      if (!stored || stored.passwordHash !== hashString(currentPass)) {
        setPassError('Current password is incorrect.'); return;
      }
      setSavingPass(true);
      setTimeout(() => {
        const updated = users.map((u: any) => u.id === user.id ? { ...u, passwordHash: hashString(newPass) } : u);
        localStorage.setItem('cw_users', JSON.stringify(updated));
        setCurrentPass(''); setNewPass(''); setConfirmPass('');
        setSavingPass(false);
        addToast({ id: `t-${Date.now()}`, type: 'success', message: 'Password changed successfully' });
      }, 600);
    } catch { setPassError('Something went wrong. Try again.'); }
  };

  const handleLogout = () => { onClose(); setTimeout(logout, 200); };

  const inputClass = "w-full px-4 py-3 rounded-xl border border-[#E4E7EC] bg-[#F3F4F6] text-[#111827] text-base outline-none focus:border-[#0984E3] focus:ring-2 focus:ring-[#0984E3]/20 transition-all";
  const passStrength  = newPass.length === 0 ? 0 : newPass.length < 6 ? 1 : newPass.length < 10 ? 2 : 3;
  const strengthColor = ['', '#C0392B', '#E67E22', '#27AE60'][passStrength];
  const strengthLabel = ['', 'Too short', 'Fair', 'Strong'][passStrength];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/30 z-[65] backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="fixed bottom-0 left-0 right-0 z-[70] rounded-t-3xl flex flex-col"
        style={{ height: '92dvh', backgroundColor: '#FFFFFF', boxShadow: '0 -4px 32px rgba(0,0,0,0.12)', border: '1px solid #E4E7EC' }}
      >
        {/* ── Fixed chrome — drag handle + title + tabs ── */}
        <div className="flex-shrink-0">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-[#D1D5DB]" />
          </div>

          {/* Title row */}
          <div className="flex items-center justify-between px-5 pb-3">
            <p className="text-base font-semibold text-[#111827]">My Profile</p>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center active:opacity-70" style={{ backgroundColor: '#F3F4F6' }}
            >
              <X className="w-4 h-4 text-[#6B7280]" />
            </button>
          </div>

          {/* Tab switcher */}
          <div className="flex mx-5 rounded-xl p-1 gap-1 mb-3" style={{ backgroundColor: '#F3F4F6' }}>
            {(['profile', 'password'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${tab === t ? 'text-white' : 'text-[#6B7280]'}`}
              >
                {tab === t && (
                  <motion.div
                    layoutId="profile-tab"
                    className="absolute inset-0 rounded-xl bg-[#0984E3]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{t === 'profile' ? 'Profile Info' : 'Change Password'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable content ── */}
        {/* Use both overflow-y-auto AND the webkit property for iOS momentum scroll */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-12"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <AnimatePresence mode="wait">

            {tab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Avatar — inside scroll so it scrolls away when keyboard appears */}
                <div className="flex flex-col items-center py-5">
                  <div className="relative">
                    <div
                      className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-white text-2xl font-bold"
                      style={{ backgroundColor: '#0984E3' }}
                    >
                      {profilePic
                        ? <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
                        : user.avatar}
                    </div>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[#0984E3] flex items-center justify-center shadow-md active:opacity-80"
                    >
                      <Camera className="w-3.5 h-3.5 text-white" />
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                  </div>
                  <p className="text-sm font-semibold text-[#111827] mt-3">{user.name}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">{user.email}</p>
                  {role && (
                    <div
                      className="flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full"
                      style={{ backgroundColor: roleStyle.bg }}
                    >
                      <ShieldCheck className="w-3 h-3 flex-shrink-0" style={{ color: roleStyle.color }} />
                      <span className="text-xs font-medium" style={{ color: roleStyle.color }}>
                        {roleStyle.label}
                      </span>
                    </div>
                  )}
                </div>

                {/* Full Name */}
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1.5 uppercase tracking-wide">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className={`${inputClass} pl-10`}
                      maxLength={50}
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1.5 uppercase tracking-wide">Email Address <span style={{ color: '#9CA3AF', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-[#6B7280] leading-relaxed">
                  Your account is stored on this device only. Clearing browser data will remove it.
                </p>

                {/* Role selector */}
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-2 uppercase tracking-wide">Your Role</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ROLE_OPTIONS.map(opt => {
                      const Icon = opt.icon;
                      const active = role === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => setRole(opt.id)}
                          className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all active:scale-[0.97] text-center"
                          style={{
                            borderColor:     active ? opt.color : '#E4E7EC',
                            backgroundColor: active ? opt.tint  : '#F9FAFB',
                          }}
                        >
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: active ? opt.color : '#E4E7EC' }}
                          >
                            <Icon className="w-4 h-4" style={{ color: active ? '#FFFFFF' : '#9CA3AF' }} />
                          </div>
                          <p
                            className="text-[11px] font-semibold leading-tight"
                            style={{ color: active ? opt.color : '#6B7280' }}
                          >
                            {opt.label}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  <AnimatePresence>
                    {role === 'warehouse_manager' && (
                      <motion.p
                        key="wm-note"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-2 text-[11px] px-3 py-2 rounded-xl leading-relaxed overflow-hidden"
                        style={{ backgroundColor: 'rgba(26,101,181,0.06)', color: '#1A65B5' }}
                      >
                        Warehouse Manager unlocks advanced settings — threshold configuration, device calibration, data export and more.
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  onClick={handleSaveProfile}
                  disabled={!isProfileDirty || saving || !name.trim()}
                  className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ backgroundColor: '#111827' }}
                >
                  {saving
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                    : isProfileDirty
                      ? <><Save className="w-4 h-4" />Save Changes</>
                      : <><CheckCircle2 className="w-4 h-4" />Up to date</>}
                </button>

                <button
                  onClick={handleLogout}
                  className="w-full py-3 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all flex items-center justify-center gap-2" style={{ border: '1.5px solid #FECACA', color: '#DC2626', backgroundColor: '#FEF2F2' }}
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </motion.div>
            )}

            {tab === 'password' && (
              <motion.div
                key="password"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4 pt-2"
              >
                {/* Current password */}
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1.5 uppercase tracking-wide">Current Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPass}
                      onChange={e => setCurrentPass(e.target.value)}
                      className={`${inputClass} pl-10 pr-12`}
                      placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent(!showCurrent)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280]"
                    >
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* New password */}
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1.5 uppercase tracking-wide">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={newPass}
                      onChange={e => setNewPass(e.target.value)}
                      className={`${inputClass} pl-10 pr-12`}
                      placeholder="Min. 6 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280]"
                    >
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {newPass.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${(passStrength / 3) * 100}%`, backgroundColor: strengthColor }}
                        />
                      </div>
                      <span className="text-xs font-medium" style={{ color: strengthColor }}>{strengthLabel}</span>
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1.5 uppercase tracking-wide">Confirm New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
                    <input
                      type="password"
                      value={confirmPass}
                      onChange={e => setConfirmPass(e.target.value)}
                      className={`${inputClass} pl-10`}
                      placeholder="Repeat new password"
                    />
                    {confirmPass.length > 0 && (
                      <div
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: newPass === confirmPass ? '#DCFCE7' : '#FEE2E2' }}
                      >
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: newPass === confirmPass ? '#16A34A' : '#DC2626' }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {passError && (
                  <div className="text-xs p-3 rounded-xl" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>{passError}</div>
                )}

                <button
                  onClick={handleChangePassword}
                  disabled={savingPass || !currentPass || !newPass || !confirmPass}
                  className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ backgroundColor: '#111827' }}
                >
                  {savingPass
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Updating…</>
                    : <><CheckCircle2 className="w-4 h-4" />Update Password</>}
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}
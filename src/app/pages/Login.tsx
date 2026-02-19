import { useState } from 'react';
import { Snowflake, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function Login() {
  const [email, setEmail]       = useState('demo@coldwatch.gh');
  const [password, setPassword] = useState('demo123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { login } = useApp();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please enter both email and password'); return; }
    if (!login(email, password)) setError('Invalid credentials');
  };

  const inputClass = 'w-full px-4 py-3 border border-border rounded-xl bg-muted focus:bg-background focus:border-[#2979C8] focus:ring-2 focus:ring-[#2979C8]/20 outline-none transition-all text-sm text-foreground';

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1F3864' }}>
      {/* Background circles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-64 h-64 border border-white/10 rounded-full" />
        <div className="absolute bottom-20 right-20 w-96 h-96 border border-white/10 rounded-full" />
        <div className="absolute top-40 right-40 w-32 h-32 border border-white/10 rounded-full" />
      </div>

      <div className="w-full max-w-md relative z-10 px-4">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(41,121,200,0.3)' }}>
            <Snowflake className="w-8 h-8 text-white" />
          </div>
          <div>
            <span className="text-3xl text-white block font-light">ColdWatch</span>
            <span className="text-xs text-blue-200/60 tracking-widest uppercase">IoT Cold Chain Monitor</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl shadow-2xl p-8 border border-border">
          <h2 className="text-xl font-semibold text-center text-foreground mb-1">Welcome Back</h2>
          <p className="text-sm text-muted-foreground text-center mb-6">Sign in to your monitoring dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-foreground font-medium mb-1.5">Email Address</label>
              <input type="email" placeholder="your.email@example.com" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className="block text-sm text-foreground font-medium mb-1.5">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} className={`${inputClass} pr-12`} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-border text-[#2979C8]" />
                <span className="text-sm text-muted-foreground">Remember me</span>
              </label>
              <button type="button" className="text-sm text-[#2979C8] hover:underline">Forgot password?</button>
            </div>

            {error && (
              <div className="text-sm text-red-600 text-center p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                {error}
              </div>
            )}

            <button type="submit" className="w-full py-3 rounded-xl text-white text-sm font-medium transition-all active:scale-[0.98]" style={{ backgroundColor: '#2979C8' }}>
              Sign In
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-border">
            <p className="text-xs text-muted-foreground text-center mb-2">Demo Credentials</p>
            <div className="bg-[#2979C8]/8 rounded-xl p-3 text-center space-y-1">
              <p className="text-xs text-muted-foreground">Email: <span className="font-mono text-[#2979C8]">demo@coldwatch.gh</span></p>
              <p className="text-xs text-muted-foreground">Password: <span className="font-mono text-[#2979C8]">demo123</span></p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-white/30 mt-6">ColdWatch v2.1 &mdash; Powered by ESP32 + DHT22</p>
      </div>
    </div>
  );
}
import { useState } from 'react';
import { Snowflake, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function Login() {
  const [email, setEmail] = useState('demo@coldwatch.gh');
  const [password, setPassword] = useState('demo123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { login } = useApp();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    const success = login(email, password);
    if (!success) setError('Invalid credentials');
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1F3864' }}>
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-20 left-20 w-64 h-64 border border-white/20 rounded-full" />
        <div className="absolute bottom-20 right-20 w-96 h-96 border border-white/20 rounded-full" />
        <div className="absolute top-40 right-40 w-32 h-32 border border-white/20 rounded-full" />
      </div>

      <div className="w-full max-w-md relative z-10 px-4">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(41,121,200,0.3)' }}>
            <Snowflake className="w-8 h-8 text-white" />
          </div>
          <div>
            <span className="text-3xl text-white block" style={{ fontFamily: 'Inter, sans-serif' }}>
              ColdWatch
            </span>
            <span className="text-xs text-blue-200/70 tracking-widest uppercase">IoT Cold Chain Monitor</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl text-center text-gray-800 mb-1">Welcome Back</h2>
          <p className="text-sm text-gray-500 text-center mb-6">Sign in to your monitoring dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-gray-700 mb-1.5">Email Address</label>
              <input
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-[#2979C8] focus:ring-2 focus:ring-[#2979C8]/20 outline-none transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-[#2979C8] focus:ring-2 focus:ring-[#2979C8]/20 outline-none transition-all text-sm pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#2979C8] focus:ring-[#2979C8]" />
                <span className="text-sm text-gray-600">Remember me</span>
              </label>
              <button type="button" className="text-sm text-[#2979C8] hover:underline">
                Forgot password?
              </button>
            </div>

            {error && (
              <div className="text-sm text-red-600 text-center p-3 bg-red-50 rounded-xl border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl text-white text-sm transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: '#2979C8' }}
            >
              Sign In
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center mb-2">Demo Credentials</p>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-600">
                Email: <span className="font-mono text-[#2979C8]">demo@coldwatch.gh</span>
              </p>
              <p className="text-xs text-gray-600">
                Password: <span className="font-mono text-[#2979C8]">demo123</span>
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-white/30 mt-6">
          ColdWatch v2.1 &mdash; Powered by ESP32 + DHT22
        </p>
      </div>
    </div>
  );
}

import { RefreshCw } from 'lucide-react';

// Matches capacitor.config.ts's appId — hardcoded rather than imported since
// that config file isn't meant to be bundled into the web app itself.
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.coldwatch.app';

export default function UpdateRequired() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center text-center px-6" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5" style={{ backgroundColor: 'rgba(9,132,227,0.08)' }}>
        <RefreshCw className="w-10 h-10" style={{ color: '#0984E3' }} />
      </div>
      <h2 className="text-xl font-semibold text-[#111827] mb-2">Update Required</h2>
      <p className="text-sm text-[#6B7280] mb-6 max-w-xs leading-relaxed">
        This version of ColdWatch is no longer supported. Please update to keep monitoring your devices and receiving alerts.
      </p>
      <a
        href={PLAY_STORE_URL}
        className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-white text-sm font-semibold active:scale-[0.98] transition-all"
        style={{ backgroundColor: '#0984E3' }}
      >
        Update Now
      </a>
    </div>
  );
}

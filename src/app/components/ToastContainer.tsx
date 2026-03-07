import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';

const STYLES: Record<string, { icon: any; color: string; bg: string; border: string }> = {
  success: { icon: CheckCircle2,  color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  error:   { icon: AlertCircle,   color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  warning: { icon: AlertTriangle, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  info:    { icon: Info,          color: '#0984E3', bg: '#EFF6FF', border: '#BFDBFE' },
};

export default function ToastContainer() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 360 }}>
      <AnimatePresence>
        {toasts.map(toast => {
          const s = STYLES[toast.type] || STYLES.info;
          const Icon = s.icon;
          return (
            <motion.div key={toast.id}
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0,  scale: 1    }}
              exit={{    opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-md"
              style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, borderLeftWidth: 3, borderLeftColor: s.color }}>
              <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: s.color }} />
              <p className="flex-1 text-xs font-medium leading-relaxed" style={{ color: '#111827' }}>{toast.message}</p>
              <button onClick={() => dismissToast(toast.id)}
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center active:opacity-70"
                style={{ color: '#9CA3AF' }}>
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
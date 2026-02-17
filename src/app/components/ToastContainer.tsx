import { useApp } from '../context/AppContext';
import { X, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react';

export default function ToastContainer() {
  const { toasts, dismissToast } = useApp();

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      default: return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getBorderColor = (type: string) => {
    switch (type) {
      case 'success': return '#27AE60';
      case 'error': return '#C0392B';
      case 'warning': return '#E67E22';
      default: return '#2979C8';
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="bg-white rounded-xl shadow-lg p-4 flex items-start gap-3 animate-in slide-in-from-right border-l-4"
          style={{ borderLeftColor: getBorderColor(toast.type) }}
        >
          {getIcon(toast.type)}
          <p className="flex-1 text-sm text-gray-800">{toast.message}</p>
          <button onClick={() => dismissToast(toast.id)} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

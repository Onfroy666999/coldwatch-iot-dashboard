import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import ToastContainer from './components/ToastContainer';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Alerts from './pages/Alerts';
import History from './pages/History';
import Devices from './pages/Devices';
import Settings from './pages/Settings';

function AppContent() {
  const { isAuthenticated, activePage } = useApp();

  if (!isAuthenticated) {
    return <Login />;
  }

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard />;
      case 'alerts': return <Alerts />;
      case 'history': return <History />;
      case 'devices': return <Devices />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F4F7FB', fontFamily: 'Inter, sans-serif' }}>
      <Sidebar />
      <div className="ml-60">
        <TopBar />
        <main className="p-6 lg:p-8">
          {renderPage()}
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

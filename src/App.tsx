import { useState, useEffect } from 'react';
import { dbService } from './lib/supabase';
import { UserProfile } from './types';
import { ToastProvider, useToast } from './utils/toast';
import {
  startBackNavigation,
  stopBackNavigation,
  setExitPromptHandler,
} from './lib/backNavigation';
import SetupBanner from './components/SetupBanner';
import OfflineSyncBar from './components/OfflineSyncBar';
import Auth from './components/Auth';
import OwnerDashboard from './components/OwnerDashboard';
import CashierDashboard from './components/CashierDashboard';
import PullToRefresh from './components/PullToRefresh';
import ServerMaintenance from './components/ServerMaintenance';

export const MAINTENANCE_MODE = false;
function ExitPrompt() {
  const { toast } = useToast();

  useEffect(() => {
    setExitPromptHandler(() => toast('Press back again to exit', 'info'));
    return () => setExitPromptHandler(null);
  }, [toast]);

  return null;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const user = await dbService.auth.getCurrentUser();
        if (user) {
          setCurrentUser(user);
        }
      } catch (err) {
        console.error('Session restoration failed:', err);
      } finally {
        setIsInitializing(false);
      }
    };
    restoreSession();

    startBackNavigation();
    return () => stopBackNavigation();
  }, []);

  const handleLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    try {
      await dbService.auth.logout();
      setCurrentUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (isInitializing) {
    return (
      <div className="h-full w-full bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="w-12 h-12 border-4 border-slate-900/10 border-t-gray-900 rounded-full animate-spin" />
        <span className="text-slate-500 text-xs font-bold mt-4 tracking-wider uppercase">
          Loading...
        </span>
      </div>
    );
  }

  if (MAINTENANCE_MODE) {
    return (
      <ToastProvider>
        <ExitPrompt />
        <PullToRefresh onRefresh={() => window.location.reload()}>
          <ServerMaintenance onRetry={() => window.location.reload()} />
        </PullToRefresh>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <ExitPrompt />
      <PullToRefresh>
        <div className="h-full w-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
          <OfflineSyncBar />
          <SetupBanner />
          {!currentUser ? (
            <Auth onLoginSuccess={handleLoginSuccess} />
          ) : currentUser.role === 'owner' || currentUser.role === 'manager' ? (
            <OwnerDashboard user={currentUser} onLogout={handleLogout} />
          ) : (
            <CashierDashboard user={currentUser} onLogout={handleLogout} />
          )}
        </div>
      </PullToRefresh>
    </ToastProvider>
  );
}


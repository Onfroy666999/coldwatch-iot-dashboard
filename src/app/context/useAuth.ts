// ── useAuth ───────────────────────────────────────────────────────────────────
//
// Owns everything related to the authenticated session:
//   - isAuthenticated, isLoading, activePage, user state
//   - login / logout / deleteAccount / completeSurvey
//   - auto-logout timer (inactivity)
//
// The coupling problem: logout and deleteAccount need to reset device, alert,
// and sim state that belongs to other future hooks. Rather than importing those
// hooks here (which would create circular dependencies), the provider passes an
// onReset callback. When the user logs out, useAuth calls onReset() and each
// other hook is responsible for cleaning up its own state inside that callback.
// This keeps useAuth self-contained and the coupling explicit.
//
// Usage in AppProvider:
//   const auth = useAuth({ onReset: () => { setDevices([]); setAlerts([]); ... } });

import { useState, useCallback, useEffect } from 'react';
import { authApi, usersApi, settingsApi } from '../Lib/api';
import { hasSession, clearTokens, getUserId } from '../Lib/tokenStorage';
import { enqueueAction, clearQueue, isRetryableError } from '../Lib/ActionQueue';
import { clearBootstrapCache, clearLastReadingCache } from './offlineCache';
import { avatarFromName } from './types';
import type { User, UserRole, Settings } from './types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseAuthOptions {
  /** Called on logout and deleteAccount — each other hook cleans up its own state here. */
  onReset: () => void;
  /** Needed for auto-logout timer — passed in rather than imported to avoid coupling. */
  autoLogoutMinutes: number;
}

export interface UseAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  activePage: string;
  user: User;
  setActivePage: (page: string) => void;
  setIsLoading: (loading: boolean) => void;
  setUser: (user: User | ((prev: User) => User)) => void;
  setIsAuthenticated: (auth: boolean) => void;
  login: (
    email: string,
    name: string,
    id: string,
    avatar: string,
    role?: UserRole,
    surveyComplete?: boolean,
  ) => void;
  logout: () => void;
  deleteAccount: () => Promise<void>;
  completeSurvey: (
    role: UserRole,
    notifPrefs: Partial<Settings>,
    notificationEmail?: string,
    notificationPhone?: string,
  ) => void;
  updateUser: (patch: Partial<User>) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth({ onReset, autoLogoutMinutes }: UseAuthOptions): UseAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(() => hasSession());
  const [isLoading,       setIsLoading]       = useState(() => hasSession());
  const [activePage,      setActivePage]      = useState(() => hasSession() ? 'dashboard' : 'login');
  const [user, setUser] = useState<User>({
    id: getUserId() ?? '',
    name: '',
    email: '',
    avatar: 'U',
    role: undefined,
    surveyComplete: undefined,
  });

  // ── login ─────────────────────────────────────────────────────────────────

  const login = useCallback((
    email: string,
    name: string,
    id: string,
    avatar: string,
    role?: UserRole,
    surveyComplete?: boolean,
  ) => {
    setUser({ id, name, email, avatar, role, surveyComplete: surveyComplete ?? false });
    setIsAuthenticated(true);
    setActivePage('dashboard');
  }, []);

  // ── logout ────────────────────────────────────────────────────────────────
  // Fires onReset() so other hooks can clear their own state (devices, alerts,
  // sim). This keeps useAuth from needing to know about those hooks directly.

  const logout = useCallback(() => {
    usersApi.removePushToken().catch(() => {}); // must fire before logout/clearTokens while JWT is valid
    authApi.logout().catch(() => {});
    clearTokens();
    clearQueue().catch(() => {});
    clearBootstrapCache();
    clearLastReadingCache();
    onReset();
    setIsAuthenticated(false);
    setActivePage('login');
  }, [onReset]);

  // ── deleteAccount ─────────────────────────────────────────────────────────

  const deleteAccount = useCallback(async () => {
    try {
      await usersApi.deleteAccount();
    } catch { /* account may already be gone — clear locally regardless */ }
    clearTokens();
    clearBootstrapCache();
    clearLastReadingCache();
    clearQueue().catch(() => {});
    try {
      localStorage.removeItem('cw_onboarding_complete');
    } catch { /* localStorage may be unavailable in some native contexts */ }
    onReset();
    setIsAuthenticated(false);
    setActivePage('login');
  }, [onReset]);

  // ── completeSurvey ────────────────────────────────────────────────────────
  // Updates user role + notification preferences at the end of onboarding.
  // Settings patch is a partial — only the fields the survey actually touches.

  // ── completeSurvey ────────────────────────────────────────────────────────
  // NOTE: This hook only updates user state and fires the API calls.
  // Local settings state is NOT updated here — useAuth has no access to it.
  // The AppProvider must wrap this to also call useSettings.updateSettings(notifPrefs)
  // so the survey's notification preferences are reflected immediately in local state.
  const completeSurvey = useCallback((
    role: UserRole,
    notifPrefs: Partial<Settings>,
    notificationEmail?: string,
    notificationPhone?: string,
  ) => {
    setUser(prev => ({
      ...prev,
      role,
      surveyComplete: true,
      ...(notificationEmail ? { notificationEmail } : {}),
      ...(notificationPhone ? { notificationPhone } : {}),
    }));
    usersApi.updateProfile({ role, surveyComplete: true, notificationEmail, notificationPhone }).catch(err => {
      if (isRetryableError(err)) {
        enqueueAction({ type: 'UPDATE_USER', payload: { role, surveyComplete: true, notificationEmail, notificationPhone } });
      }
    });
    settingsApi.update(notifPrefs as Record<string, unknown>).catch(err => {
      if (isRetryableError(err)) {
        enqueueAction({ type: 'UPDATE_SETTINGS', payload: notifPrefs as Record<string, unknown> });
      }
    });
  }, []);

  // ── updateUser ────────────────────────────────────────────────────────────

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser(prev => {
      // Recompute avatar initial when name changes and no explicit avatar was supplied
      const computedAvatar = patch.name && !patch.avatar ? avatarFromName(patch.name) : patch.avatar;
      return { ...prev, ...patch, ...(computedAvatar ? { avatar: computedAvatar } : {}) };
    });
    usersApi.updateProfile({
      name:              patch.name,
      email:             patch.email,
      phone:             patch.phone,
      notificationEmail: patch.notificationEmail,
      notificationPhone: patch.notificationPhone,
      role:              patch.role,
    }).catch(err => {
      if (isRetryableError(err)) {
        // Offline/server error — queue the update so it retries when connectivity returns.
        enqueueAction({ type: 'UPDATE_USER', payload: patch as Record<string, unknown> });
      }
    });
  }, []);

  // ── Auto-logout (inactivity timer) ───────────────────────────────────────
  // Listens for user activity events and resets a countdown. If no activity
  // occurs within autoLogoutMinutes, clears the session.
  // autoLogoutMinutes comes from Settings — passed in to avoid coupling
  // useAuth to the settings state directly.

  useEffect(() => {
    if (!isAuthenticated || autoLogoutMinutes === 0) return;

    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        clearTokens();
        setIsAuthenticated(false);
        setActivePage('login');
      }, autoLogoutMinutes * 60 * 1000);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointermove'] as const;
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [isAuthenticated, autoLogoutMinutes]);

  return {
    isAuthenticated,
    isLoading,
    activePage,
    user,
    setActivePage,
    setIsLoading,
    setUser,
    setIsAuthenticated,
    login,
    logout,
    deleteAccount,
    completeSurvey,
    updateUser,
  };
}

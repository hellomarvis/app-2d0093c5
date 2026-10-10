import { create } from 'zustand';
import { apiClient } from '../lib/apiClient';
import {
  SESSION_EXPIRED_EVENT,
  TOKEN_KEY,
  USER_KEY,
  clearSession,
  getToken,
  isTokenExpired,
} from '../lib/session';

interface User {
  id: number;
  email: string;
  tenantId: string;
  isAdmin?: boolean;
}

interface AuthResponse {
  user: User;
  token: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: () => boolean;
}

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

// A token left over past its expiry is not a session — start signed out rather
// than letting the guards wave a dead token through.
function loadSession(): { user: User | null; token: string | null } {
  const token = getToken();
  if (token === null || isTokenExpired(token)) {
    clearSession();
    return { user: null, token: null };
  }
  return { user: loadUser(), token };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initialise from localStorage so state survives page refresh
  ...loadSession(),

  login: async (email, password) => {
    const { user, token } = await apiClient.post<AuthResponse>('/api/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user, token });
  },

  signup: async (email, password) => {
    const { user, token } = await apiClient.post<AuthResponse>('/api/auth/signup', { email, password });
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user, token });
  },

  logout: () => {
    clearSession();
    set({ user: null, token: null });
  },

  // Holding a token is not enough — an expired one means signed out.
  isAuthenticated: () => {
    const token = get().token;
    return token !== null && !isTokenExpired(token);
  },
}));

// A session that ended mid-request (expired or rejected token) must not leave
// the UI looking signed in; SessionWatcher handles the redirect.
window.addEventListener(SESSION_EXPIRED_EVENT, () => {
  useAuthStore.setState({ user: null, token: null });
});

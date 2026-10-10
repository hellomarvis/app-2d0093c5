// Session storage + expiry helpers shared by the API client, the auth store and
// the route guards. One place decides what "signed in" means, so a token that
// expired or was rejected always ends the same way: storage cleared and the user
// sent back to /login — never a page left rendering "Something went wrong".

export const TOKEN_KEY = 'auth_token';

// Where a signed-in user lands: after login/signup, and when GuestRoute turns
// them away from a public page. It MUST be a registered protected route — if the
// app's home is not /dashboard (e.g. /chat), change it HERE, or "/" and the
// catch-all bounce between GuestRoute and a missing page forever.
export const APP_HOME = '/workspace-home';
export const USER_KEY = 'auth_user';

// Dispatched on window when a session ends on its own (expired token, or the API
// answered 401). The auth store resets its state and SessionWatcher redirects.
export const SESSION_EXPIRED_EVENT = 'auth:session-expired';

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

// Endpoints that legitimately answer 401 for bad credentials — a failed login
// must show an error on the form, not trigger the session-expired sign-out.
const AUTH_ENDPOINTS = ['/api/auth/login', '/api/auth/signup', '/api/auth/forgot-password', '/api/auth/reset-password'];

export function isAuthEndpoint(endpoint: string): boolean {
  return AUTH_ENDPOINTS.some((path) => endpoint.startsWith(path));
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// Reads the `exp` claim without verifying the signature — the server stays the
// authority, this only lets the client notice a dead token before using it.
// Anything unreadable counts as still valid so the server gets to decide.
export function isTokenExpired(token: string | null): boolean {
  if (token === null || token === '') return true;
  const payload = token.split('.')[1];
  if (payload === undefined) return false;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

export function hasValidSession(): boolean {
  return !isTokenExpired(getToken());
}

// Ends the session: clears storage and announces it once. Safe to call from
// several failing requests at once — only the first one still sees a token.
export function endSession(): void {
  const hadSession = getToken() !== null || localStorage.getItem(USER_KEY) !== null;
  clearSession();
  if (!hadSession) return;
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

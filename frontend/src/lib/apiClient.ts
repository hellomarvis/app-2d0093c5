import { SESSION_EXPIRED_MESSAGE, endSession, getToken, isAuthEndpoint, isTokenExpired } from './session';

const API_BASE_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const authEndpoint = isAuthEndpoint(endpoint);

  // Token is already past its `exp`: sign out now instead of firing a request
  // we know comes back 401 and rendering an error state on top of a dead session.
  if (!authEndpoint && token !== null && isTokenExpired(token)) {
    endSession();
    throw new ApiError(401, SESSION_EXPIRED_MESSAGE);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    // The server rejected the token (expired, revoked, signing key changed):
    // end the session so the app redirects to /login instead of showing
    // "Something went wrong" on every page.
    if (response.status === 401 && !authEndpoint) {
      endSession();
      throw new ApiError(401, SESSION_EXPIRED_MESSAGE);
    }
    const error = await response.json().catch(() => ({ message: 'Request failed' })) as { message?: string };
    throw new ApiError(response.status, error.message ?? 'Request failed');
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};

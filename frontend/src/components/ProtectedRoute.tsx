import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { endSession, isTokenExpired } from '@/lib/session';
import type { FunctionComponent } from '@/common/types';

// Route guard: renders child routes only when a *live* session token exists,
// otherwise redirects to /login. A token that is merely present is not enough —
// an expired one is a signed-out user, not a page full of failed requests.
// Use as a layout route:
//   <Route element={<ProtectedRoute />}>…protected routes…</Route>
export const ProtectedRoute = (): FunctionComponent => {
  const token = useAuthStore((state) => state.token);
  const expired = token !== null && isTokenExpired(token);

  // Drop the stale token so the navbar stops showing a signed-in user and
  // SessionWatcher can explain what happened.
  useEffect(() => {
    if (expired) {
      endSession();
    }
  }, [expired]);

  if (token === null || expired) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
};

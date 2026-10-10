import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { APP_HOME, isTokenExpired } from '@/lib/session';
import type { FunctionComponent } from '@/common/types';

// The inverse of ProtectedRoute: renders child routes only for a signed-OUT
// visitor. A signed-in user who opens /login, /signup or any public page is sent
// to APP_HOME instead — the public side of the app is not theirs any more.
// An expired token counts as signed out, so the login page stays reachable.
// Use as a layout route:
//   <Route element={<GuestRoute />}>…public routes…</Route>
export const GuestRoute = (): FunctionComponent => {
  const token = useAuthStore((state) => state.token);

  if (token !== null && !isTokenExpired(token)) {
    return <Navigate to={APP_HOME} replace />;
  }
  return <Outlet />;
};

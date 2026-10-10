import { Navigate } from 'react-router-dom';
import type { FunctionComponent } from '@/common/types';

// The real post-login home is Workspace Home — this route is kept only so an
// old bookmark/link to /dashboard still lands somewhere real.
export const Dashboard = (): FunctionComponent => {
  return <Navigate to="/workspace-home" replace />;
};

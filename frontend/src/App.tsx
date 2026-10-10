import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AppLayout } from '@/components/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { GuestRoute } from '@/components/GuestRoute';
import { SessionWatcher } from '@/components/SessionWatcher';
import { Login } from '@/pages/Login';
import { Signup } from '@/pages/Signup';
import { ForgotPassword } from '@/pages/ForgotPassword';
import { ResetPassword } from '@/pages/ResetPassword';
import { Dashboard } from '@/pages/Dashboard';
import { Landing } from '@/pages/Landing';
import { WorkspaceHome } from '@/pages/WorkspaceHome';
import { ChannelConversation } from '@/pages/ChannelConversation';
import { ChannelDetails } from '@/pages/ChannelDetails';
import { DirectConversation } from '@/pages/DirectConversation';
import { People } from '@/pages/People';
import { Inbox } from '@/pages/Inbox';
import { Repositories } from '@/pages/Repositories';
import { RepositoryAnalysis } from '@/pages/RepositoryAnalysis';
import { AiAssistant } from '@/pages/AiAssistant';
import { Connections } from '@/pages/Connections';
import { AdminUsers } from '@/pages/AdminUsers';
import { AdminModeration } from '@/pages/AdminModeration';
import { AdminIntegrations } from '@/pages/AdminIntegrations';
import type { FunctionComponent } from '@/common/types';

// Declarative route table — all pages are registered here.
// EVERY page renders inside <AppLayout> (the shared navbar + footer shell) —
// register new routes under it so the whole app keeps ONE consistent chrome.
// Never give an individual page its own <header>/<nav>/<footer>.
// No devtools overlays: this tree is what end users see in the live preview.
const App = (): FunctionComponent => {
	return (
		<>
			{/* Signs the user out and sends them to /login when the session expires. */}
			<SessionWatcher />
			<Routes>
				<Route element={<AppLayout />}>
					{/* Public (guest-only) routes — a signed-in user is sent to APP_HOME.
					    Login, signup, the landing page and every public page live here, so
					    after login none of them is reachable. A page that must stay open to
					    BOTH (privacy, terms) goes outside this block, still under AppLayout. */}
					<Route element={<GuestRoute />}>
						{/* This product HAS a public front door — the minimal Landing page. */}
						<Route path="/" element={<Landing />} />
						<Route path="/login" element={<Login />} />
						<Route path="/sign-in" element={<Login />} />
						<Route path="/signup" element={<Signup />} />
						<Route path="/sign-up" element={<Signup />} />
						{/* Forgot-password flow — ALWAYS kept, whatever the design shows.
						    /login must link to /forgot-password ("Forgot password?"). */}
						<Route path="/forgot-password" element={<ForgotPassword />} />
						{/* ── DOMAIN ROUTES GO HERE (public) ── */}
					</Route>

					{/* The emailed reset link must work signed in OR out, so it sits
					    outside GuestRoute. Keep it. */}
					<Route path="/reset-password" element={<ResetPassword />} />

					{/* Protected routes — redirect to /login when unauthenticated */}
					<Route element={<ProtectedRoute />}>
						<Route path="/dashboard" element={<Dashboard />} />
						{/* ── DOMAIN ROUTES GO HERE (protected) ── */}
						<Route path="/workspace-home" element={<WorkspaceHome />} />
						<Route path="/channels/:id" element={<ChannelConversation />} />
						<Route path="/channels/:id/details" element={<ChannelDetails />} />
						<Route path="/direct/:id" element={<DirectConversation />} />
						<Route path="/people" element={<People />} />
						<Route path="/inbox" element={<Inbox />} />
						<Route path="/repositories" element={<Repositories />} />
						<Route path="/repositories/:id" element={<RepositoryAnalysis />} />
						<Route path="/ai-assistant" element={<AiAssistant />} />
						<Route path="/connections" element={<Connections />} />
						<Route path="/admin/users" element={<AdminUsers />} />
						<Route path="/admin/moderation" element={<AdminModeration />} />
						<Route path="/admin/integrations" element={<AdminIntegrations />} />
					</Route>

					{/* Unknown paths fall back to the root — whatever it resolves to. */}
					<Route path="*" element={<Navigate to="/" replace />} />
				</Route>
			</Routes>
			<Toaster richColors position="top-center" />
		</>
	);
};

export default App;

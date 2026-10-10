import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/sonner';
import { SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE } from '@/lib/session';
import type { FunctionComponent } from '@/common/types';

/**
 * SessionWatcher — turns an expired or rejected session into a real sign-out:
 * a toast, then the login screen. Without it a dead token leaves every page
 * rendering its own "Something went wrong" error state while the navbar still
 * shows the user as signed in. Mounted once in App.tsx; keep it mounted.
 */
export const SessionWatcher = (): FunctionComponent => {
	const navigate = useNavigate();

	useEffect(() => {
		const handleExpired = (): void => {
			toast.error(SESSION_EXPIRED_MESSAGE);
			navigate('/login', { replace: true });
		};
		window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
		return () => { window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired); };
	}, [navigate]);

	return null;
};

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToHash — makes in-page anchor navigation actually work.
 *
 * React Router does NOT scroll to a URL hash on its own. Clicking a
 * <Link to="/#pricing"> (or navigating to any /#section link from another
 * page) updates the address bar but the browser never jumps to the element,
 * so section nav links silently "change the URL and do nothing". This is
 * mounted once inside <AppLayout> (so it wraps every route) and reacts to the
 * location:
 *   • hash present  → scrolls the element with that id into view, retrying for
 *     a few frames in case the section mounts a tick late after a route change;
 *   • no hash       → scrolls to the top, so moving between pages starts at the
 *     top like a real multi-page site (React Router keeps the old scroll pos).
 *
 * The sticky-header offset is handled by `scroll-padding-top` on <html>
 * (src/styles/tailwind.css), so the target lands *below* the navbar, not
 * hidden under it. Plain <a href="#id"> anchors already scroll natively — this
 * rescues the React-Router <Link> and cross-page cases. Renders nothing.
 */
export const ScrollToHash = (): null => {
	const { pathname, hash } = useLocation();

	useEffect(() => {
		if (!hash) {
			// New page, no anchor — reset to the top instantly (explicit 'auto'
			// overrides the CSS `scroll-behavior: smooth` so long pages don't
			// visibly animate all the way up on every navigation).
			window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
			return;
		}

		const id = decodeURIComponent(hash.slice(1));
		if (!id) return;

		let raf = 0;
		let tries = 0;
		const scroll = (): void => {
			const el = document.getElementById(id);
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'start' });
			} else if (tries++ < 5) {
				// Section not mounted yet (route just changed) — retry next frame.
				raf = requestAnimationFrame(scroll);
			}
		};
		scroll();
		return () => cancelAnimationFrame(raf);
	}, [pathname, hash]);

	return null;
};

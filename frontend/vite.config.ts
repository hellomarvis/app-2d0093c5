import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// The live-preview runner serves this dev server behind an ALB on
// `https://app-{id8}-live.<base>`. Vite's default HMR client derives its
// websocket URL from the page origin and gets it wrong behind the proxy
// (no port → malformed `wss://host:/`, then a doomed `ws://localhost:5170`
// fallback) so HMR never connects and edits never hot-apply. The runner
// injects these envs; consume them so the HMR socket targets the public
// host over wss:443. When unset (plain local dev) leave `hmr` undefined and
// Vite's localhost default works fine.
//
// `overlay: false` is set ONLY in the runner case (envs present): while the
// app is still being generated, half-written files trigger transient
// import-analysis / transform errors, and Vite's full-screen red error
// overlay would leak into the user-facing preview iframe — making a working
// build look broken. Suppressing it is display-only (HMR, logging and live
// updates are unchanged); the iframe shows the last good render (or blank)
// and self-heals once the next valid module hot-loads. Plain local dev keeps
// the overlay (hmr stays undefined → Vite default).
const hmrHost = process.env.VITE_DEV_HMR_HOST;
const hmrConfig = hmrHost
	? {
			protocol: process.env.VITE_DEV_HMR_PROTOCOL || "wss",
			host: hmrHost,
			clientPort: Number(process.env.VITE_DEV_HMR_CLIENT_PORT || "443"),
			overlay: false,
		}
	: undefined;

// Dev proxy: /api → the Express backend, so hitting THIS dev server's port
// directly (local manual testing) works end to end. The runner injects
// VITE_BACKEND_PORT per session; plain local dev falls back to the
// boilerplate's default backend port 3000. In cloud the runner's own proxy
// routes /api before vite ever sees it, so this is simply unused there.
// Dev-only — `vite build` ignores `server.*`.
const backendPort = process.env.VITE_BACKEND_PORT || "3000";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		host: true,
		port: 3001,
		strictPort: true,
		hmr: hmrConfig,
		proxy: {
			"/api": `http://localhost:${backendPort}`,
		},
		// `allowedHosts: true` disables Vite's CSRF host-header check.
		// Required because live-preview-runner spawns the dev server behind
		// an ALB and iframe Host headers look like `app-{id8}-live.<base>`.
		// CLI does not expose this setting. Dev-only — `vite build` ignores.
		allowedHosts: true,
	},
});

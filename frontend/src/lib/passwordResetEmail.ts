// passwordResetEmail — sends the forgot-password email through the platform,
// the SAME way lib/leads.ts sends a lead: a POST straight from the browser to
// the platform API, using the project id + platform origin baked into the
// bundle at build time (services/mediaAppEnv.ts on the platform).
//
// Flow: the page calls our backend (POST /api/auth/forgot-password); the
// backend creates the one-time reset token and answers with `sealed` — the
// email (recipient + reset link) encrypted with a key only the backend and the
// platform hold. This file posts that blob to the platform, which opens it and
// sends the email. The browser never sees the reset link and can't change it.
//
// No `sealed` in the backend's answer means the backend already handled it
// (the app's own Resend key, or local dev where the link is logged) — nothing
// to post.

// Bracket access: env comes from Vite's index signature
// (noPropertyAccessFromIndexSignature is on in the boilerplate tsconfig).
const PROJECT_ID = (import.meta.env["VITE_PROJECT_ID"] as string | undefined)?.trim() ?? "";
const API_BASE = (import.meta.env["VITE_MEDIA_API_BASE"] as string | undefined)
	?.replace(/\/+$/, "")
	?.trim() ?? "";

/** Post the backend's sealed reset email to the platform. Throws on failure. */
export async function sendPasswordResetEmail(sealed: string | undefined, appName: string): Promise<void> {
	if (!sealed) return;
	if (PROJECT_ID === "" || API_BASE === "") {
		throw new Error("Password reset email is not configured for this site.");
	}

	const res = await fetch(`${API_BASE}/v1/projects/${PROJECT_ID}/app-email/password-reset`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ sealed, appName }),
	});

	if (!res.ok) {
		const detail = (await res.json().catch(() => null)) as { message?: string } | null;
		throw new Error(detail?.message || `Could not send the reset email (${res.status})`);
	}
}

// leads — form submissions (contact / newsletter / subscribe / waitlist) that
// NOTIFY the project owner by email.
//
// The form POSTs straight to the platform API, which looks up the project owner
// and emails them the lead ("New lead on <project>"). The two values needed —
// the project id and the platform API origin — are baked into the bundle at
// build time by the platform (services/mediaAppEnv.ts), the SAME vars the media
// library already uses.
//
// This is a NOTIFY pipe, not storage: if the form ALSO belongs in the app's own
// database (e.g. a "contact messages" model), persist it your normal way AND
// call submitLead() so the owner gets an email too — the two are independent.
//
// When those vars are absent (local `npm run dev`, or a build with no platform
// API configured) `leadsConfigured()` returns false — guard on it and fall back
// to a plain mailto: link or your own backend so the UI still works.

// Bracket access: env comes from Vite's index signature
// (noPropertyAccessFromIndexSignature is on in the boilerplate tsconfig).
const PROJECT_ID = (import.meta.env["VITE_PROJECT_ID"] as string | undefined)?.trim() ?? "";
const API_BASE = (import.meta.env["VITE_MEDIA_API_BASE"] as string | undefined)
	?.replace(/\/+$/, "")
	?.trim() ?? "";

/** One filled-in field of the contact/subscribe form, in display order. */
export interface LeadField {
	label: string;
	value: string;
}

export interface LeadPayload {
	fields: LeadField[];
	/** Prospect email → owner's reply-to. Optional; the API also sniffs it from fields. */
	replyTo?: string;
	/** Prospect name for the email greeting. Optional. */
	name?: string;
}

/** True when the deployed app can submit leads to the platform. */
export function leadsConfigured(): boolean {
	return PROJECT_ID !== "" && API_BASE !== "";
}

/** Outcome of a lead submission. `delivered` is false when the owner paused
 *  notifications (or there's no owner inbox) — the caller should show a notice
 *  rather than a "we'll get back to you" success. */
export interface LeadResult {
	delivered: boolean;
	/** True when the owner paused email notifications from the platform. */
	paused: boolean;
}

/**
 * Submit a form lead to the platform so the owner is emailed. Throws on a
 * transport/server failure so the caller can show an error (and optionally fall
 * back to mailto: / its own backend). Resolves with `{ delivered, paused }` on a
 * 2xx so the UI can reflect whether the message actually reached the owner.
 */
export async function submitLead(payload: LeadPayload): Promise<LeadResult> {
	if (!leadsConfigured()) {
		throw new Error("Lead submission is not configured for this site.");
	}

	const res = await fetch(`${API_BASE}/v1/projects/${PROJECT_ID}/leads`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	const detail = (await res.json().catch(() => null)) as
		| { message?: string; delivered?: boolean; paused?: boolean }
		| null;

	if (!res.ok) {
		throw new Error(detail?.message || `Submission failed (${res.status})`);
	}

	return { delivered: detail?.delivered !== false, paused: detail?.paused === true };
}

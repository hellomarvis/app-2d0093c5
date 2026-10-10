# READ THIS FIRST — Pre-built workspace (fullcodeV2)

This workspace was seeded before you started and the dev servers are already
running. **Do not scaffold, re-install, or rewrite the plumbing — it exists and
works.** Your job is the domain layer and the experience.

## What already exists (verified working)

**Backend (`backend/`)** — Express 5 + TypeScript + Prisma + JWT auth, deps installed:
- `src/index.ts` — app wiring, `/health`, `trust proxy`, `APP_BASE_PATH`
  handling, static `public/` + SPA fallback, error handler. Mount domain
  routers at the `DOMAIN ROUTES GO HERE` marker.
- `src/routes/auth.ts` + `src/api/auth.ts` — signup / login / change-password /
  forgot-password / reset-password, JWT issued and verified. Reset emails are
  sealed by `src/lib/mailer.ts` and sent through the platform by the frontend's
  `src/lib/passwordResetEmail.ts` (same path as lead forms) — already wired,
  needs nothing from you. `src/routes/admin.ts` — admin-only user listing.
- `src/middleware.ts` — `jwtCheck` (sets `req.user`) and `requireAdmin`.
- `prisma/schema.prisma` — User model done (with `isAdmin`); add domain models
  at the `DOMAIN MODELS GO HERE` marker, then `npx prisma db push`
  (DATABASE_URL points at this app's own schema — safe; never `prisma migrate`).
- `prisma/seed.ts` — admin + demo-user upsert (frozen block; leave it).
- `config/index.ts` — all env access. Do not edit; read from it.
- `src/custom/uploads.ts` — image upload endpoint proxied to the platform's
  media library (works when the platform injects the media env vars).
- `src/lib/integrationSeam.ts` — `IntegrationNotConfiguredError`,
  `notConfigured(res, integration)`, `handleSeamError(err, res)`. The honest
  boundary for any step a third-party provider would perform; tag each seam
  `// @integration-seam <provider-id> <capability>`. The platform rewires it
  to the provider's kit once the owner supplies keys.

**Frontend (`frontend/`)** — Vite + React 19 + TS + react-router v7 + Tailwind v4 + shadcn/ui, deps installed:
- `src/App.tsx` — declarative routes with public + protected `DOMAIN ROUTES GO
  HERE` markers, all nested under `src/components/AppLayout.tsx` (the ONE
  shared navbar + footer shell; add nav links at its marker, wrap page content
  in its `PageContainer`). `<Toaster>` mounted.
  `src/components/ProtectedRoute.tsx` guards authed routes;
  `src/components/GuestRoute.tsx` keeps signed-in users off public routes.
- `src/lib/apiClient.ts` — `apiClient.get/post/put/delete<T>()`, token
  auto-attached, throws `ApiError(status, message)` with the server's message.
- `src/store/authStore.ts` — `useAuthStore` (zustand): `user`, `token`,
  `login`, `signup`, `logout`; localStorage persistence.
- `src/pages/Login.tsx`, `Signup.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`
  — done. The forgot-password flow ships in EVERY app, whether or not the
  design shows it: keep the `/forgot-password` + `/reset-password` routes and
  the "Forgot password?" link on the sign-in page, and the consent dialog
  (`components/PasswordResetConsentDialog.tsx`) the forgot-password page shows
  before the Lumexa platform sends the email — its send button stays disabled
  until the consent checkbox is ticked (restyle, never remove). Every password
  field uses `<PasswordInput>` (`components/ui/password-input.tsx`, show/hide
  eye toggle) — never a bare `<Input type="password">`. There is NO landing page: `/`
  redirects to /login until you decide the product has a public front door.
- `src/brand.ts` — APP_NAME / APP_TAGLINE / APP_GLYPH. Set these FIRST.
- `src/components/common/` — `PageHeader`, `ConfirmDialog`, `AppShell`,
  `SidebarLayout`, `ResourceLayout`, `DataTableShell`, `FormShell`, and
  `states.tsx` (`LoadingState`, `LoadingRows`, `ErrorState`, `EmptyState`).
- `src/components/ui/` — shadcn primitives (button, card, dialog, input, table,
  tabs, select, badge, sonner, …).
- `src/styles/tailwind.css` — the design tokens. Brand colors + font were
  ALREADY applied by the runner. **Never change token values or fonts** —
  style with token-backed classes (`bg-primary`, `text-muted-foreground`, …).
- `src/lib/MediaImageField.tsx` + `src/lib/mediaClient.ts` — image field wired
  to the platform media library; use for image inputs.

**Design kit (`design-kit/` at the workspace root)** — `patterns.md` has
copy-adaptable hero / stat-band / card / CTA / empty-state recipes. **Adapt
these for the landing page instead of inventing structure from scratch.**

## Your job, in order

1. `frontend/src/brand.ts` → the product's name/tagline/glyph.
2. Domain models in `prisma/schema.prisma` (marker) → `npx prisma db push`.
3. Domain routes: `backend/src/api/<entity>.ts` (handlers) +
   `backend/src/routes/<entity>.ts` (router) → mount at the marker in
   `src/index.ts`. Follow the auth routes' error style (`handleError`,
   friendly `message` fields, correct status codes).
4. Domain pages in `frontend/src/pages/` → routes at the App.tsx markers →
   nav links where the page spec puts them.
5. The root route — decide it. If this product has a public front door, build
   that page and point `/` at it; if it is sign-in only, leave the redirect.
   Read the approved design and the PRD to tell which. Never ship a generic hero.
6. Verify per the brief: drive the real API with curl (expected status codes),
   check every page renders its loading/empty/error/success states, and leave
   `verify/smoke-test.sh` behind if the brief requires it.

## Conventions (keep them — they are the quality bar)

- Every mutation → `toast.success/error(...)` naming the thing acted on.
  Nothing silently appears or vanishes.
- Every list page → `LoadingState` / `ErrorState` / `EmptyState` (with a CTA).
- **Overlays come from `components/ui`** (`Select`, `Dialog`, `AlertDialog`,
  `DropdownMenu`, `Popover`, `Tooltip`) — they carry `translate="no"`, which stops
  Chrome auto-translate from rewriting text React later unmounts. Without it,
  opening a dropdown on a translated page throws `removeChild` and blanks the
  whole app. Never hand-roll a portal/overlay, and never strip that attribute.
- Destructive actions → `ConfirmDialog`.
- Buttons: busy text while pending, disabled against double-submit.
- Errors: surface `ApiError.message` — never raw error objects, never console-only.
- People are shown by display name, never email/id, unless the brief says otherwise.

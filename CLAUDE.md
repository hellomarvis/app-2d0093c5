# fullcodeV2 — build rules (read README-agent.md for the full workspace map)

This workspace is PRE-SEEDED and the dev servers are ALREADY RUNNING (vite +
nodemon, owned by the runner). Your job is the domain layer and the experience
— not the plumbing.

## Hard rules — violations break the platform contract

1. **Never kill, respawn, or re-configure the dev servers.** They hot-reload
   your edits. Never change ports, never edit `vite.config.ts` server settings.
2. **Fonts**: the font lives in `frontend/src/styles/tailwind.css` — the
   `@import` line plus `--font-sans` / `--font-display`. Set it there and
   nowhere else: never add a `<link>` font tag, never import a font inside a
   component. If you are building from an approved design that loads its own
   typefaces, put THOSE in the `@import` and the tokens — one font source for
   the whole app, and it is this file. The `@import` must stay the FIRST
   statement in the file or Tailwind drops it and the font never loads.
3. **Colors/theme**: brand colors live in `tailwind.css` `:root` tokens
   (`--primary`, `--accent`, …) and every component styles with the
   token-backed Tailwind classes (`bg-primary`, `text-foreground`, …). Never
   hardcode a brand hex in a component. The token VALUES themselves are the
   one place colour is decided: if they are still the boilerplate's greyscale
   placeholders and you are building from a design with its own palette, set
   them from that design FIRST, then style with the classes. Fix it once in
   the tokens; never work around it per component.
4. **Deploy contract** (the packager builds this exact tree): don't touch
   `buildspec.yml`, `backend/Dockerfile`, `backend/bootstrap.js`,
   `backend/config/index.ts`, `backend/src/lib/prisma.ts`, the `/health` route,
   the static/`public/` SPA-fallback block in `backend/src/index.ts`, or the
   admin-upsert block in `backend/prisma/seed.ts`. Backend must keep compiling
   with `npm run build` (tsc → `dist/src/index.js`).
5. **Auth is done** (JWT, `routes/auth.ts`, `middleware.jwtCheck`,
   `requireAdmin`, seeded admin, forgot/reset password by email). Use it;
   don't rebuild it. The "Forgot password?" link on the sign-in page and the
   `/forgot-password` + `/reset-password` routes stay in every app, design or not.
6. **Database**: extend `backend/prisma/schema.prisma` at the
   `DOMAIN MODELS GO HERE` marker, then `npx prisma db push` (the schema in
   `DATABASE_URL` is this app's own — safe). Never `prisma migrate`.

## Conventions (the quality bar — keep them)

- **One shell for the whole app**: every page renders inside `<AppLayout>`
  (App.tsx layout route — shared navbar + footer). Register new routes UNDER
  it, add nav links at its markers, and wrap page content in `<PageContainer>`
  (landing sections are full-bleed). NEVER give a page its own
  header/nav/footer — that is how apps end up with inconsistent chrome.
- **The navbar swaps with auth state**, like every real app. AppLayout has two
  mutually exclusive buckets — `PUBLIC NAV LINKS (SIGNED-OUT) GO HERE` (landing
  anchors + public pages) and `APP NAV LINKS (SIGNED-IN) GO HERE` (Dashboard +
  every domain page) — and they never render together. Only the logo/app name
  and footer are always visible. Marketing links still showing next to Dashboard
  after login is a BUG. The mobile drawer mirrors the same two buckets.
- **Every nav link must RESOLVE**: a navbar link either points at a route you
  registered in `App.tsx` (unknown paths bounce to the landing via the catch-all)
  or is a landing anchor `href="/#section"` whose `<section id="section">` exists.
  React Router does not scroll to a hash by itself — `ScrollToHash` (mounted in
  AppLayout) does; keep it. A link that changes the URL but scrolls/opens nothing
  is the top user-reported bug, and the deploy gate fails the build on any dead one.
- **One visual voice**: the craft utilities in `src/styles/tailwind.css`
  (`wash`, `band`, `eyebrow`, `shadow-card`, `lift`, `rise`, `font-display`)
  are used on EVERY page — landing and authed alike. h1/h2 render in the
  display serif automatically; keep it. Person entities always render with
  `<InitialsAvatar name={…}/>`. Detail pages fill their column (two-column
  with a meaningful sidebar) — never a lone card in whitespace.
- **Gated visibility must be communicated**: when a user's content is hidden
  from others by a business rule (pending approval, inactive subscription,
  draft state), their own dashboard MUST say so with a status badge/banner and
  what to do next. Silent invisibility reads as a bug.
- Every mutation → a `sonner` toast naming the thing acted on
  (`toast.success('Booking confirmed for Studio A')`). Nothing silently
  appears/vanishes.
- Every list page → `LoadingState` / `ErrorState` / `EmptyState` (with a CTA)
  from `components/common/states.tsx` — never a blank area.
- **Image fields are UPLOADED, never typed.** Any form field for an image
  (avatar, cover, gallery, logo, listing/product photo) uses
  `<MediaImageField value onChange label/>` (`src/lib/MediaImageField.tsx`) —
  a real upload button that stores to S3 via `/api/uploads` and returns a URL.
  NEVER render a raw "Image URL" text input.
- **Overlays come from `components/ui`** (`Select`, `Dialog`, `AlertDialog`,
  `DropdownMenu`, `Popover`, `Tooltip`) — they carry `translate="no"`, which stops
  Chrome auto-translate from rewriting text React later unmounts. Without it,
  opening a dropdown on a translated page throws `removeChild` and blanks the
  whole app. Never hand-roll a portal/overlay, and never strip that attribute.
- Destructive actions → `ConfirmDialog`.
- Buttons show busy text while pending and are disabled against double-submit.
- Errors surface `ApiError.message` — never raw error objects.
- Humans are shown by display name, never email/id, unless the PRD says
  otherwise.

## Where things go

- Domain models → `backend/prisma/schema.prisma` (marker) → `npx prisma db push`
- Domain routes → `backend/src/routes/<entity>.ts` + `backend/src/api/<entity>.ts`,
  mounted at the `DOMAIN ROUTES GO HERE` marker in `backend/src/index.ts`
- Domain pages → `frontend/src/pages/`, wired at the `DOMAIN ROUTES GO HERE`
  markers in `frontend/src/App.tsx` (react-router v7 declarative)
- Root route → there is NO landing page in this boilerplate. `/` redirects to
  /login. If the product has a public front door, build that page and route `/`
  to it; if it is sign-in only, leave the redirect. The approved design and the
  PRD say which — never ship a generic hero page nobody asked for
- Brand tagline/glyph → `frontend/src/brand.ts` (set APP_TAGLINE + APP_GLYPH first).
  APP_NAME is LOCKED to the user's project name (already set + re-applied after your
  turn) — do NOT change it. The favicon is baked from the brand logo automatically.

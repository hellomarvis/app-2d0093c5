# fullcodeV2 frontend — agent guide

Vite + React 19 + TypeScript + **react-router v7 (declarative)** + Tailwind v4
+ shadcn/ui + zustand + sonner. No TanStack Router, no generated hooks, no
OpenAPI codegen — call the API with `apiClient` directly.

## Routing

Routes live in `src/App.tsx` only (declarative `<Routes>`; no file-based
routing, no route-tree generation). ALL routes nest under `<AppLayout>` — the
shared navbar + footer shell (`src/components/AppLayout.tsx`). Add pages at
the two markers:
- public: inside the `<Route element={<GuestRoute/>}>` block — guest-only, a
  signed-in user is redirected to `APP_HOME` (login, signup, landing, public
  pages). `APP_HOME` lives in `src/lib/session.ts` — if the app's home is not
  `/dashboard`, change it there (never hard-code the path in pages). A page open to BOTH (privacy, terms) goes outside it, under `<AppLayout>`.
- protected: inside the `<Route element={<ProtectedRoute/>}>` block
Wrap page content in `<PageContainer>` (landing sections stay full-bleed).
Never build a page with its own header/nav/footer. Use `Link` / `useNavigate` /
`useParams` from `react-router-dom`.

**The navbar swaps with auth state** — like every real app. AppLayout has two
mutually exclusive buckets that never render together; put each link in exactly
one:
- `PUBLIC NAV LINKS (SIGNED-OUT) GO HERE` — logged-OUT only: landing section
  anchors + genuinely public pages. Never a protected route (it just bounces the
  visitor to `/login`).
- `APP NAV LINKS (SIGNED-IN) GO HERE` — logged-IN only: Dashboard + every
  top-level domain page. Never a landing anchor. Admin entries gate further on
  `{user.isAdmin && …}`.

Only the logo/app name and the footer are always visible; the auth buttons
already swap. Marketing links still showing after login is a bug, not extra
navigation. The mobile hamburger/drawer mirrors the same two buckets.

**Every nav link must RESOLVE** (a link that changes the URL but goes nowhere is
a bug — the top user-reported defect). Two kinds only: (a) app page → a `NavLink`
to a path you registered in `App.tsx` — an unregistered path hits the catch-all
`<Route path="*">` and bounces back to the landing; (b) landing section jump →
`<a href="/#features">` whose matching `<section id="features">` exists. React
Router does NOT scroll to a hash on its own — `ScrollToHash`
(`src/components/ScrollToHash.tsx`, already mounted in AppLayout) does, but only
when the target id exists. Never write your own scroll handler, never remove
ScrollToHash, never leave a bare `href="#"`. The deploy gate statically scans
AppLayout and FAILS the build on any dead nav link.

## Data access

`src/lib/apiClient.ts` — `apiClient.get<T>('/api/…')`, `.post`, `.put`,
`.delete`. Token auto-attached; failures throw `ApiError(status, message)`
carrying the server's message. Pattern for pages:

```tsx
const [items, setItems] = useState<Thing[] | null>(null);
const [error, setError] = useState<string | null>(null);
useEffect(() => {
  apiClient.get<Thing[]>('/api/things')
    .then(setItems)
    .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
}, []);
if (error) return <ErrorState message={error} onRetry={…} />;
if (!items) return <LoadingState />;
if (!items.length) return <EmptyState title="No things yet" action={…} />;
```

## Auth

### Session expiry — do not hand-roll it

An expired or rejected token is handled centrally: `apiClient` calls
`endSession()` on a dead token or a 401, which clears storage and fires
`auth:session-expired`; `SessionWatcher` (mounted in `App.tsx`) toasts and
redirects to `/login`, and `ProtectedRoute` checks the token's `exp`, not just
its presence. So NEVER show an `ErrorState` for a 401 and never write your own
"session expired" handling — the user is already on the login screen.

`useAuthStore` (zustand): `user`, `token`, `login(email, password)`,
`signup(email, password)`, `logout()`. Login/Signup pages exist — restyle if
the brief demands, don't rewire.

### Forgot password — always present

`pages/ForgotPassword.tsx` (`/forgot-password`, inside `<GuestRoute>`) and
`pages/ResetPassword.tsx` (`/reset-password?token=…`, outside it — the emailed
link must work signed in or out) are wired to `POST /api/auth/forgot-password`
and `/api/auth/reset-password`. The sign-in page links to `/forgot-password`
next to the password field. Submitting the forgot-password form opens
`components/PasswordResetConsentDialog.tsx` — the email is sent by the Lumexa
platform, so it only goes out after the user ticks the consent checkbox and
confirms (the send button is disabled until then; Cancel sends nothing).
Every password field — sign in, sign up, reset — uses `<PasswordInput>` from
`components/ui/password-input.tsx` (show/hide eye toggle); never a bare
`<Input type="password">`.
Keep all of this in every app, even when the design has no such link; restyle
it to match, never remove it.

## Non-negotiables

- `src/styles/tailwind.css` is the ONE place fonts and colour token values are
  decided. Never import a font or hardcode a brand hex anywhere else; style with
  token classes (`bg-primary`, `text-muted-foreground`, `border`, `bg-card` …).
  The platform sets those values when it can; when it has not — the tokens are
  still greyscale placeholders and you are building from a design with its own
  palette and typefaces — set them from the design there first.
- Never edit `vite.config.ts` server/HMR settings.
- **Every screen MUST be fully responsive — mobile-first, non-negotiable.**
  Design for **375px first**, then scale up (`sm:`/`md:`/`lg:` — never desktop-only).
  Verify at **375px (mobile), 768px (tablet), 1280px+ (desktop)** — nothing is done
  until it works at 375px. Hard rules: NO horizontal scroll / overflow on mobile
  (`overflow-x-hidden` on the page shell; `max-w-full` on images/media); the navbar
  COLLAPSES to a hamburger/drawer on mobile (never a cramped desktop row); multi-column
  grids/flex rows stack to ONE column on mobile (`grid-cols-1 md:grid-cols-3`); wide
  content — tables, code, charts — lives in an `overflow-x-auto` wrapper, never the page
  body; dialogs/modals fit the viewport (`max-h-[90vh] overflow-y-auto`, full-width sheet
  on mobile); tap targets ≥ 44px; body text ≥ 16px (no `text-xs` for reading copy).
  Two-column detail layouts collapse to stacked on mobile. Sticky headers/CTAs must not
  cover content.
- Every mutation → sonner toast naming the thing acted on; busy/disabled
  buttons; `ConfirmDialog` for destructive actions; `ApiError.message` shown
  on failure. Every list page → Loading/Error/Empty states.
- **Images are UPLOADED, never typed.** EVERY image field — avatars, cover
  photos, gallery images, logos, banners, product/listing photos, anything with
  a `src` — MUST use `<MediaImageField value={url} onChange={setUrl} label="…" />`
  from `src/lib/MediaImageField.tsx`. It gives a real upload button that stores
  the file in S3 (via the app's `/api/uploads` backend) and returns a public URL.
  NEVER render a bare `<Input placeholder="Image URL">` / a raw URL text box for
  an image — that is a bug. If a model has an image, its create/edit form uses
  `MediaImageField`; if a page shows an image, it renders the stored URL as
  `<img src={url}>`.
- **Images MUST fill their box cleanly at any source size.** You don't control
  the uploaded photo's dimensions, so NEVER render a bare `<img>` whose intrinsic
  size drives the layout. Put every image in a container with a FIXED footprint
  (a set height or `aspect-[w/h]` + `w-full`) and `overflow-hidden`, with the
  `<img>` as `h-full w-full object-cover` (crop-to-fill photos, hero, covers,
  product/listing/gallery) — or `object-contain` for logos/brand marks (never
  crop a logo). No stretched, squished, letter-boxed, or overflowing images; a
  card/hero/avatar looks identical whether the upload is portrait, square, or huge.
- **Public-facing forms email the owner.** ANY form a visitor/customer submits
  that the app owner would want to hear about — contact, newsletter/subscribe,
  waitlist, demo/quote request, "get in touch" — MUST also call
  `submitLead({ fields, replyTo, name })` from `src/lib/leads.ts` on success, so
  the platform emails the project owner the submission. This is a NOTIFY on top
  of your own handling: if the form also belongs in a DB model, persist it your
  normal way AND call `submitLead`. `fields` is an ordered `{label,value}[]` of
  what the visitor entered; pass their email as `replyTo` and name as `name`.
  Guard with `leadsConfigured()` (false in local dev) so the UX still works.
  Do NOT wire authed CRUD forms or internal admin forms to it — leads are
  inbound prospects only.

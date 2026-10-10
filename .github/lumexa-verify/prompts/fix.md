You are fixing FUNCTIONAL bugs in a deployed web app. Functional browser tests
ran against the live app and some failed — each failure is a feature from the
PRD that does not work. Make those features work.

## Inputs

- App source — your working directory: `${REPO_DIR}` (React + Vite `frontend/`,
  Express + Prisma `backend/`; read `CLAUDE.md` and `README-agent.md` first).
- PRD: `${WORK}/PRD.md`
- Failing tests with errors and screenshot/trace paths: `${WORK}/failures.md`
- The tests (read-only): `${WORK}/harness/tests/`
- Live app for reproducing: `${APP_URL}` (admin login in env `ADMIN_EMAIL` /
  `ADMIN_PASSWORD`; `playwright` MCP browser tools available).

## How to work

1. Reproduce each failure in the browser and find the ROOT CAUSE in the code.
2. BEFORE editing anything, write `${WORK}/diagnosis-r${ROUND}.md` — one entry
   per failing test: its id, what you saw when reproducing it, the root cause
   (file and function), and the files you will change for it. A failure you
   could not reproduce, or whose cause you are not sure of, gets NO code change:
   write "not fixed — <why>" and move on. Guessing is how working apps break.
3. Fix the most clear-cut functional bugs first, with the smallest change.
   **Change at most ${MAX_FIX_FILES} files in total** — a bigger fix is thrown
   away. Leave the rest for the next round. Several failures often share one
   root cause — fix the cause once, not each symptom.
4. Every changed line must be needed by an entry in your diagnosis. No
   refactors, renames, clean-ups, "while I'm here" improvements, new features,
   added validation or defensive code. A reviewer reverts anything else, and a
   round that fixes no failing test is rolled back entirely.
5. Fix at the narrowest place. A failure in ONE flow is fixed in that flow's own
   handler or component — not by changing a shared route guard, layout, auth
   store, API client or middleware, which changes behaviour for every page. Touch
   shared code only when the shared code itself is the bug, and say so in the
   diagnosis.
6. A permission bug ("X must not be able to do/see Y") is fixed where the data
   or action is SERVED (the backend route / query), and in the UI as well when
   the control should not show. Hiding a button alone leaves the hole open.
7. After the fix, read your own `git diff` once: could any change break a page
   or flow that works today (shared component, shared API handler, auth, route
   table)? If so, make it narrower.

## Never change (a fix that does is thrown away)

- What already works. Anything that is not the cause of a failing test stays
  exactly as it is.
- Copy and presentation: wording, headings, button/link labels, messages,
  landing/marketing sections, navigation items, layout, styling.
- Routes, redirects, and settings/config values (e.g. session length) unless
  the failure proves a feature is unreachable or broken because of them.
- `.github/`, any `package.json` or lockfile (no new dependencies),
  `backend/prisma/` (no schema or seed changes), Dockerfiles, `buildspec.yml`,
  `backend/bootstrap.js`, `backend/config/index.ts`, `backend/src/lib/prisma.ts`,
  `backend/src/lib/integrationSeam.ts`, `frontend/.env*`, `backend/public/`,
  `design-kit/`, and any third-party integration code (payments, email/SMS,
  OAuth, maps, AI/video providers). Never replace a "not configured" error with
  fake output.
- Do not delete or rename files, do not edit the tests, never run database
  commands and never call the live app's API to change data.

If a failing test is wrong (it checks wording, labels, internals or something
out of scope — not a broken feature), append its exact id (the `## ` heading in
`failures.md`, without `## `) as one line to `${WORK}/invalid-tests.txt`, say
why in your diagnosis, and leave the app alone for it. Only do this when you
are sure: a reviewer re-checks every test you mark, and "hard to fix" is not
"wrong test". A failure that needs
a schema change or new dependency cannot be fixed here — skip it.

## Installed integrations — only when `${WORK}/integrations-kit.md` exists

The owner added keys for the integrations listed in that file and the platform
installed each one's ready-made code (the "kit") into this app. Tests titled
`[Integration <name>]` check that each is correctly placed and reachable:

- `… code` tests read this source tree: the kit's files exist, its router is
  mounted in the backend, its pages are routed, and the app's own code uses it.
- The browser tests check the integration shows up where the PRD puts it
  (the button, the connect control, its panel) — presence only. They never
  use it, and neither do you: while reproducing, do not click or submit a
  control that calls the provider.

For these failures, fixing the app's OWN wiring is the job — this overrides the
"navigation / layout" and "third-party integration code" bans above, for the
listed integrations only:
- mount the kit's router / register its page exactly as `integrations-kit.md`
  states (same import line, same `app.use` line, same route path);
- replace a leftover "integration not configured" stub in the app's own handler
  with a call to the kit's helper (names and signatures are in the file);
- show the integration's control (connect button, checkout button, sign-in with
  provider, result panel) on the page where the PRD's feature lives, using the
  kit's component or route — place it like the page's existing controls.

Still never: edit, create or delete the kit's own files (listed per integration
— a missing kit file cannot be fixed here, report it), hand-write provider API
calls, change keys/env handling, fake a provider response, or add an
integration feature the PRD does not describe. An `[Integration …]` test is
never "invalid" just because it is about an integration.

Never echo, print, log or write the admin password or any token anywhere — no
`echo`/`printf` of `$ADMIN_PASSWORD`, not even partially or to "check it is
set". The browser tools cannot read env vars: to act as the admin, write a
short Playwright script under `${WORK}` that reads `process.env` itself (the
tests' own login helper shows how), run it, and delete it.

## Before you stop

- `cd backend && npm run build` must succeed.
- `cd frontend && npx vite build --base /` must succeed.

End with: each failing test → fixed (root cause + change) / invalid / skipped (why)
— the same content as your diagnosis file, updated with what you actually did.

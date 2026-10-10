# fullcodeV2 backend — agent guide

Express 5 + TypeScript + Prisma + JWT. Compiles with `npm run build` (tsc →
`dist/src/index.js` + `dist/prisma/seed.js`) — keep it compiling; the deploy
image runs exactly that output.

## Adding a domain feature

1. Model in `prisma/schema.prisma` at the `DOMAIN MODELS GO HERE` marker.
   Include the display-name/timestamp fields the pages show. Then
   `npx prisma db push` (this app's own schema — safe). Never `prisma migrate`.
2. Handlers in `src/api/<entity>.ts` — follow `src/api/auth.ts` style:
   validate input, correct status codes (400 invalid / 401 unauthenticated /
   403 not-owner / 404 missing / 409 duplicate-conflict), friendly `message`
   fields, `handleError` for the catch-all.
3. Router in `src/routes/<entity>.ts` — `middleware.jwtCheck` for authed
   routes, `middleware.requireAdmin` for admin-only.
4. Mount at the `DOMAIN ROUTES GO HERE` marker in `src/index.ts`
   (`app.use('/api/<entities>', <entity>Routes)`).

## Integrity rules

- Ownership checks on every mutation of user-owned data (`403` when
  `record.userId !== req.user.id`, unless admin).
- Race-prone transitions (booking a slot, claiming an item) → atomic
  conditional updates (`updateMany({ where: { id, status: 'AVAILABLE' } })`,
  check `count`, `409` on miss) — never read-then-write.
- List endpoints return arrays as `res.json(items)` — the shape pages expect.

## Do not touch

`Dockerfile`, `bootstrap.js`, `config/index.ts`, `src/lib/prisma.ts`, the
`/health` route, the static/`public/` SPA-fallback + `APP_BASE_PATH` block in
`src/index.ts`, the admin-upsert block in `prisma/seed.ts`, `tsconfig.json`.
Extend `prisma/seed.ts` BELOW the frozen block for domain demo data (idempotent
upserts only — it runs on every container start). Demo data must look REAL:
human display names ("Sarah Chen"), varied domain-plausible values (subjects,
prices, dates) — never placeholder or timestamp-derived names. The landing and
browse pages render this data; it IS the first impression of the product.

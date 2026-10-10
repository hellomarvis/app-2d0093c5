# fullcodeV2 — full-stack boilerplate for the V2 codegen pipeline

The flag-gated (`CODEGEN_V2_ENABLED`) full-stack template. Same deploy contract
as `fullcode` (root `buildspec.yml`, `backend/Dockerfile`, `:3000`, `/health`,
`backend/public` SPA serving), with the codegen-hostile machinery removed:
no OpenAPI/orval generated hooks, no TanStack Router route trees, no demo
entity. React Router v7 declarative routing, direct
`apiClient` calls, marker-based extension points, and agent guides
(`CLAUDE.md` per layer + `README-agent.md` + `design-kit/patterns.md`).

## Stack

| Layer    | Technology |
|----------|------------|
| Frontend | React 19, Vite, TypeScript, react-router v7, Tailwind CSS v4, shadcn/ui, zustand, sonner |
| Backend  | Express 5, TypeScript, Prisma, PostgreSQL, JWT auth |

## Local development

```bash
docker compose up -d                       # postgres
cd backend && cp .env.example .env && pnpm install
npx prisma db push && pnpm run dev         # :3000
cd ../frontend && pnpm install && pnpm run dev  # :3001
```

Agent-facing docs: `README-agent.md` (workspace map), `CLAUDE.md` (hard rules),
`frontend/CLAUDE.md`, `backend/CLAUDE.md`, `design-kit/patterns.md` (landing
recipes). Platform docs: `docs/CODEGEN-V2-PLAN.md` in curs-pm-api.

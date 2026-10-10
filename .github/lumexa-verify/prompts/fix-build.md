Your last change to the app in `${REPO_DIR}` no longer builds. The build
output is in `${WORK}/build.log`.

Fix ONLY the build errors your change introduced (see `git diff`). Same rules
as before: application source only (`frontend/src/`, `backend/src/`), no
dependency, schema, infra or test changes, no deleted or renamed files, no
database commands.

Then confirm both succeed:
- `cd backend && npm run build`
- `cd frontend && npx vite build --base /`

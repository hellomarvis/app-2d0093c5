FROM public.ecr.aws/docker/library/node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Boilerplate ships NO package-lock.json — `npm ci` aborts without a lockfile
# (CodeBuild deploy fails here). Use `npm install` so it resolves from
# package.json (incl. any deps codegen added).
RUN npm install --no-audit --no-fund --legacy-peer-deps
COPY . .
RUN mkdir -p public
# Ensure bootstrap.js exists even if it was deleted or not in the template.
# The real bootstrap.js pulls patched source from S3; this stub is a safe no-op.
RUN test -f bootstrap.js || echo 'process.exit(0);' > bootstrap.js
RUN npx prisma generate
RUN npm run build

FROM public.ecr.aws/docker/library/node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund --legacy-peer-deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma
# Frontend static files (vite build output, copied here by the builder pipeline).
# Copied from builder stage where COPY . . already included public/ if it exists.
COPY --from=builder /app/public ./public
# bootstrap.js conditionally pulls patched source from S3 when
# APP_HOT_SOURCE_PREFIX is set (modify flow). No-op otherwise.
# Copied from builder stage (which got it via COPY . .) so it works even if
# the build context root doesn't have it (e.g. if Claude Code SDK moved files).
COPY --from=builder /app/bootstrap.js ./bootstrap.js
EXPOSE 3000
# 1. bootstrap.js — pull hot-patched dist/public/prisma from S3 if env var is set (no-op on fresh builds)
# 2. prisma db push — idempotent schema sync on every container start
# 3. seed — idempotent admin upsert (creates admin@<APP_SLUG>.app / admin123 once; no-op on subsequent boots)
# 4. node — start the server
CMD ["sh", "-c", "node bootstrap.js && npx prisma db push --accept-data-loss && (node dist/prisma/seed.js || true) && node dist/src/index.js"]

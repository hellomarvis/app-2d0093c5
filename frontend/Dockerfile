FROM public.ecr.aws/docker/library/node:20-alpine AS builder
WORKDIR /app
# Boilerplate ships NO pnpm-lock.yaml — copying it would fail, and
# --frozen-lockfile requires it. Copy only package.json and install
# unfrozen so codegen-added deps resolve.
COPY package.json ./
RUN npm install -g pnpm && pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm run build

FROM public.ecr.aws/nginx/nginx:stable-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

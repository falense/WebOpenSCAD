FROM node:20-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl unzip git \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Development image: source is bind-mounted by docker compose ---
FROM base AS dev
ENV NODE_ENV=development
# Run as the node user (uid 1000) so files written to the bind mount
# stay owned by the host user.
RUN mkdir -p /app/node_modules && chown -R node:node /app
USER node
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# --- Production build ---
FROM base AS build
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run fetch-engine && npm run build

# --- Production server ---
FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

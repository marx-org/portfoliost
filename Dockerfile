# ---- build stage ----
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY index.html vite.config.ts tailwind.config.js postcss.config.js tsconfig.json tsconfig.node.json ./
COPY public/ public/
COPY src/ src/
COPY generated/ generated/
COPY mocks/shared/data/universe.json mocks/shared/data/universe.json

RUN npm ci && npm run build

# ---- serve stage ----
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1

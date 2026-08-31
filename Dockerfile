# ---- build stage ----
FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

ARG VITE_OIDC_ISSUER_URL=""
ENV VITE_OIDC_ISSUER_URL=$VITE_OIDC_ISSUER_URL

ARG VITE_OIDC_CLIENT_ID=""
ENV VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID

ARG VITE_PASSWORD_LOGIN_ENABLED=""
ENV VITE_PASSWORD_LOGIN_ENABLED=$VITE_PASSWORD_LOGIN_ENABLED

ARG NODE_AUTH_TOKEN=""

COPY package.json package-lock.json .npmrc ./
COPY index.html vite.config.ts tailwind.config.js postcss.config.js tsconfig.json tsconfig.node.json ./
COPY public/ public/
COPY src/ src/
COPY generated/ generated/
COPY mocks/shared/data/universe.json mocks/shared/data/universe.json

RUN sed -i "s|\${NODE_AUTH_TOKEN}|${NODE_AUTH_TOKEN}|g" .npmrc && npm ci && rm .npmrc && npm run build

# ---- serve stage ----
FROM node:22-alpine

RUN npm install -g serve

COPY --from=build /app/dist /app/dist
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["serve", "-s", "/app/dist", "-l", "80"]

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1

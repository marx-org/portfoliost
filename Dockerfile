# syntax=docker/dockerfile:1

# ---- build stage ----
FROM ghcr.io/marx-org/base-node:22-alpine@sha256:4c555748c9819babb757c7c328a12443b9d242edcfcc11cd196c24623dc704dd AS build

WORKDIR /app

ARG APP_VERSION=""
ENV APP_VERSION=$APP_VERSION

ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

ARG VITE_OIDC_ISSUER_URL=""
ENV VITE_OIDC_ISSUER_URL=$VITE_OIDC_ISSUER_URL

ARG VITE_OIDC_CLIENT_ID=""
ENV VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID

ARG VITE_PASSWORD_LOGIN_ENABLED=""
ENV VITE_PASSWORD_LOGIN_ENABLED=$VITE_PASSWORD_LOGIN_ENABLED

COPY package.json package-lock.json .npmrc ./
COPY index.html vite.config.ts tailwind.config.js postcss.config.js tsconfig.json tsconfig.node.json tsconfig.ts7.json ./
COPY tools/contracts-generator/ tools/contracts-generator/
COPY tools/typescript7/ tools/typescript7/
COPY public/ public/
COPY src/ src/
COPY generated/ generated/
COPY mocks/shared/data/universe.json mocks/shared/data/universe.json

RUN --mount=type=secret,id=NODE_AUTH_TOKEN,env=NODE_AUTH_TOKEN,required=true \
    printf '%s\n' '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}' >> .npmrc && \
    npm ci && \
    rm -f .npmrc && \
    npm run build

# ---- serve stage ----
FROM ghcr.io/marx-org/base-node:22-alpine@sha256:4c555748c9819babb757c7c328a12443b9d242edcfcc11cd196c24623dc704dd

RUN npm install -g serve

COPY --from=build /app/dist /app/dist
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["serve", "-s", "/app/dist", "-l", "80"]

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1

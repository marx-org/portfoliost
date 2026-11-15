# syntax=docker/dockerfile:1

# Browser assets are architecture-independent. Run npm, TypeScript and Vite on
# the builder's native CPU, not once per target under QEMU (#109).
FROM --platform=$BUILDPLATFORM ghcr.io/marx-org/base-node:22-alpine@sha256:4c555748c9819babb757c7c328a12443b9d242edcfcc11cd196c24623dc704dd AS build

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY tools/contracts-generator/package.json tools/contracts-generator/package-lock.json tools/contracts-generator/

# Source and APP_VERSION changes must not invalidate dependency installation.
RUN --mount=type=secret,id=NODE_AUTH_TOKEN,env=NODE_AUTH_TOKEN,required=true \
    printf '%s\n' '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}' >> .npmrc && \
    npm ci && \
    rm -f .npmrc && \
    npm --prefix tools/contracts-generator ci

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

COPY index.html vite.config.ts tailwind.config.js postcss.config.js tsconfig.json tsconfig.node.json tsconfig.ts7.json ./
COPY tools/typescript7/ tools/typescript7/
COPY public/ public/
COPY src/ src/
COPY generated/ generated/
COPY mocks/shared/data/universe.json mocks/shared/data/universe.json

RUN npm run build:prepared

# serve and its dependencies are pure JavaScript. Install the locked tree on the
# native builder and copy it into either runtime; no target-platform RUN needed.
FROM --platform=$BUILDPLATFORM ghcr.io/marx-org/base-node:22-alpine@sha256:4c555748c9819babb757c7c328a12443b9d242edcfcc11cd196c24623dc704dd AS server
WORKDIR /opt/serve
COPY tools/static-server/package.json tools/static-server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# ---- serve stage ----
FROM ghcr.io/marx-org/base-node:22-alpine@sha256:4c555748c9819babb757c7c328a12443b9d242edcfcc11cd196c24623dc704dd

COPY --from=server /opt/serve /opt/serve
ENV PATH="/opt/serve/node_modules/.bin:${PATH}"

COPY --from=build /app/dist /app/dist
COPY --chmod=755 scripts/docker-entrypoint.sh /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["serve", "-s", "/app/dist", "-l", "80"]

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1

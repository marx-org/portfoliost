#!/bin/sh
# Generate runtime config from env vars (for Kubernetes deployment).
# In local dev, import.meta.env.VITE_* is used instead.
cat > /app/dist/runtime-config.js <<EOF
window.__OIDC_CONFIG__ = {
  issuerUrl: "${OIDC_ISSUER_URL:-}",
  clientId: "${OIDC_CLIENT_ID:-}",
};
EOF
exec "$@"

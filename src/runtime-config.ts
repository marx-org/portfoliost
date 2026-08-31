declare global {
  interface Window {
    __OIDC_CONFIG__?: {
      issuerUrl?: string
      clientId?: string
      passwordLoginEnabled?: boolean
    }
  }
}

export function getOidcConfig() {
  const cfg = window.__OIDC_CONFIG__
  return {
    issuerUrl: cfg?.issuerUrl || import.meta.env.VITE_OIDC_ISSUER_URL || "",
    clientId: cfg?.clientId || import.meta.env.VITE_OIDC_CLIENT_ID || "",
  }
}

export function isPasswordLoginEnabled() {
  const cfg = window.__OIDC_CONFIG__
  if (typeof cfg?.passwordLoginEnabled === "boolean") return cfg.passwordLoginEnabled
  const env = import.meta.env.VITE_PASSWORD_LOGIN_ENABLED
  return env === "true" || env === "1"
}

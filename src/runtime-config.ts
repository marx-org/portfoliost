declare global {
  interface Window {
    __OIDC_CONFIG__?: {
      issuerUrl?: string
      clientId?: string
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

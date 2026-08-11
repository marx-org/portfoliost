const TOKEN_KEY = "portfoliost_token"

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `Request failed with status ${status}`
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

type RequestOptions = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  url: string
  body?: unknown
}

async function request<T>({ method, url, body }: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" }
  const token = getToken()
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers["content-type"] = "application/json"

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, data)
  }
  return data as T
}

export const http = {
  get: <T>(url: string) => request<T>({ method: "GET", url }),
  post: <T>(url: string, body?: unknown) => request<T>({ method: "POST", url, body }),
  patch: <T>(url: string, body?: unknown) => request<T>({ method: "PATCH", url, body }),
  put: <T>(url: string, body?: unknown) => request<T>({ method: "PUT", url, body }),
  delete: <T>(url: string) => request<T>({ method: "DELETE", url }),
}

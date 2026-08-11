export type * from "../../generated/api-types"

export interface AuthUser {
  id: string
  email: string
  language: string
  role: string
  isDemoUser: boolean
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
}

export interface AuthResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: AuthUser
}

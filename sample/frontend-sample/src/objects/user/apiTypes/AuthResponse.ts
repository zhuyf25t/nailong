import type { UserProfile } from '../UserProfile'

export interface AuthResponse {
  ok: boolean
  token?: string
  user?: UserProfile
  message?: string
}

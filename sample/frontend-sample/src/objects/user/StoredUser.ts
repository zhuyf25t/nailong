import type { InstantString } from './TimeCodecs'
import type { UserId } from './UserId'
import type { UserRole } from './UserRole'

export interface StoredUser {
  id: UserId
  username: string
  passwordHash: string
  passwordSalt: string
  role: UserRole
  createdAt: InstantString
}

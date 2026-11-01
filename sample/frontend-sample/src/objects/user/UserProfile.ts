import type { InstantString } from './TimeCodecs'
import type { UserId } from './UserId'
import type { UserRole } from './UserRole'

export interface UserProfile {
  id: UserId
  username: string
  role: UserRole
  createdAt: InstantString
}

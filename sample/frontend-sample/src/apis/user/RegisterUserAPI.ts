import { APIMessage } from '@/system/api/APIMessage'
import type { AuthResponse } from '@/objects/user/apiTypes/AuthResponse'
import type { UserRole } from '@/objects/user/UserRole'

export class RegisterUserAPI extends APIMessage<AuthResponse> {
  readonly username: string
  readonly password: string
  readonly role: UserRole

  constructor(username: string, password: string, role: UserRole = 'reader') {
    super()
    this.username = username
    this.password = password
    this.role = role
  }
}

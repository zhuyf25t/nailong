import { APIMessage } from '@/system/api/APIMessage'
import type { AuthResponse } from '@/objects/user/apiTypes/AuthResponse'

export class LoginUserAPI extends APIMessage<AuthResponse> {
  readonly username: string
  readonly password: string

  constructor(username: string, password: string) {
    super()
    this.username = username
    this.password = password
  }
}

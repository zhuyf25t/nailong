export class AdminCredentials {
  readonly username: string
  readonly password: string

  constructor(username: string, password: string) {
    this.username = username
    this.password = password
  }

  static fromForm(username: string, password: string) {
    return new AdminCredentials(username.trim(), password.trim())
  }

  get isComplete() {
    return this.username.length > 0 && this.password.length > 0
  }
}

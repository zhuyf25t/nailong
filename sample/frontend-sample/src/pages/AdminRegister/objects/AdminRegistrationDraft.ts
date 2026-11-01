export class AdminRegistrationDraft {
  readonly username: string
  readonly password: string
  readonly confirmPassword: string

  constructor(username: string, password: string, confirmPassword: string) {
    this.username = username
    this.password = password
    this.confirmPassword = confirmPassword
  }

  static fromForm(username: string, password: string, confirmPassword: string) {
    return new AdminRegistrationDraft(username.trim(), password.trim(), confirmPassword.trim())
  }

  get isComplete() {
    return this.username.length > 0 && this.password.length > 0 && this.confirmPassword.length > 0
  }

  get passwordsMatch() {
    return this.password === this.confirmPassword
  }
}

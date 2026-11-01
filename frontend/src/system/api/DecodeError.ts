/** An untrusted response or persisted value does not match its contract. */
export class DecodeError extends Error {
  constructor(path: string, expected: string) {
    super(`${path}: expected ${expected}`);
    this.name = 'DecodeError';
  }
}


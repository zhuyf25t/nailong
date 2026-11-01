import type { ApiFailure } from './ApiFailure.ts';
export class ApiError extends Error {
  readonly failure: ApiFailure;
  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = 'ApiError';
    this.failure = failure;
  }
  get kind() { return this.failure.kind; }
  get code() { return this.failure.kind === 'http' ? this.failure.code : undefined; }
  get status() { return this.failure.kind === 'http' || this.failure.kind === 'decode' ? this.failure.status : undefined; }
}


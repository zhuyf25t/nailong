import type { AuthResponse } from '../../../objects/player/apiTypes/AuthResponse.ts';

/** Cancellation protects both the stored session and the one-time home action. */
export class AuthRequest {
  private sequence = 0;
  private controller: AbortController | null = null;

  cancel(): void {
    ++this.sequence;
    this.controller?.abort();
    this.controller = null;
  }

  async run(
    request: (signal: AbortSignal) => Promise<AuthResponse>,
    onSuccess: (response: AuthResponse) => void,
  ): Promise<'accepted' | 'cancelled'> {
    this.cancel();
    const sequence = this.sequence;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const response = await request(controller.signal);
      if (sequence !== this.sequence || controller.signal.aborted) return 'cancelled';
      onSuccess(response);
      return 'accepted';
    } catch (error: unknown) {
      if (sequence !== this.sequence || controller.signal.aborted) return 'cancelled';
      throw error;
    } finally {
      if (sequence === this.sequence) this.controller = null;
    }
  }
}

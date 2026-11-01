import type { AuthResponse } from '../../objects/player/apiTypes/AuthResponse.ts';
import type { SessionToken } from '../../objects/system/SessionToken.ts';
import type { PlayerSessionState } from './PlayerSessionState.ts';
import type { SessionDependencies } from './SessionDependencies.ts';

/** Owns the async session boundary; old requests cannot overwrite a newer login. */
export class SessionController {
  private state: PlayerSessionState = { kind: 'checking' };
  private readonly listeners = new Set<() => void>();
  private operation = 0;

  constructor(private readonly dependencies: SessionDependencies) {}

  readonly getSnapshot = (): PlayerSessionState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(state: PlayerSessionState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  private stillCurrent(operation: number, token: SessionToken): boolean {
    return this.operation === operation && this.dependencies.readToken() === token;
  }

  readonly refresh = async (): Promise<void> => {
    const operation = ++this.operation;
    const token = this.dependencies.readToken();
    if (token === null) {
      this.publish({ kind: 'signed-out' });
      return;
    }
    this.publish({ kind: 'checking' });
    try {
      const player = await this.dependencies.getCurrentPlayer(token);
      if (this.stillCurrent(operation, token)) this.publish({ kind: 'signed-in', player, token });
    } catch (error: unknown) {
      if (!this.stillCurrent(operation, token)) return;
      if (this.dependencies.isUnauthorized(error)) {
        this.dependencies.clearToken();
        this.publish({ kind: 'signed-out' });
      } else {
        // A failed connection does not prove the stored session is invalid.
        this.publish({ kind: 'unavailable', message: '暂时无法确认登录状态。请检查网络后重试，你的登录凭据仍保留在此标签页。' });
      }
    }
  };

  readonly acceptAuth = (auth: AuthResponse): void => {
    this.dependencies.writeToken(auth.userToken);
    ++this.operation;
    this.publish({ kind: 'signed-in', player: auth.player, token: auth.userToken });
  };

  /** Call with the token of the failed request, never with a freshly read token. */
  readonly invalidate = (token: SessionToken): void => {
    if (this.dependencies.readToken() !== token) return;
    ++this.operation;
    this.dependencies.clearToken();
    this.publish({ kind: 'signed-out' });
  };

  readonly logout = async (): Promise<void> => {
    const operation = ++this.operation;
    const token = this.dependencies.readToken();
    if (token === null) {
      this.publish({ kind: 'signed-out' });
      return;
    }
    try {
      await this.dependencies.logout(token);
      // Revocation wins over a simultaneous refresh of this same token.
      this.invalidate(token);
    } catch (error: unknown) {
      if (this.dependencies.isUnauthorized(error)) {
        this.invalidate(token);
        return;
      }
      if (!this.stillCurrent(operation, token)) return;
      // Do not claim a server-side revocation succeeded when it did not.
      this.publish({ kind: 'unavailable', message: '退出尚未完成，登录凭据仍保留。请恢复连接后重试退出，或重新确认登录状态。' });
      throw error;
    }
  };
}

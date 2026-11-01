import type { APIMessage } from './APIMessage.ts';
/** Production build keeps class names; tests also execute the bundled API classes. */
export function apiNameOf(message: APIMessage<unknown>): string {
  const name = message.constructor.name;
  if (!/^[A-Z][A-Za-z0-9]*API$/.test(name)) throw new Error('API class name was not preserved in this build.');
  return name.toLowerCase();
}


export type MoreState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'failed'; message: string };

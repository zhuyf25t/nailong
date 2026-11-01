export interface ReplayUploadState {
  readonly status: 'pending' | 'uploading' | 'saved' | 'blocked';
  readonly message: string | null;
}

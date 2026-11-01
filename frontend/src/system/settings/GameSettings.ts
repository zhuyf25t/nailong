export interface GameSettings {
  readonly quality: 'low' | 'high';
  readonly volume: number;
  readonly cameraSensitivity: number;
}
export const DEFAULT_GAME_SETTINGS: GameSettings = { quality: 'high', volume: .5, cameraSensitivity: 1 };

export function decodeGameSettings(value: unknown): GameSettings {
  if (typeof value !== 'object' || value === null) throw new Error('设置格式无效');
  const data: Record<string, unknown> = Object.fromEntries(Object.entries(value));
  if (data.quality !== 'low' && data.quality !== 'high') throw new Error('画质设置无效');
  if (typeof data.volume !== 'number' || !Number.isFinite(data.volume) || data.volume < 0 || data.volume > 1) throw new Error('音量设置无效');
  if (typeof data.cameraSensitivity !== 'number' || !Number.isFinite(data.cameraSensitivity) || data.cameraSensitivity < .5 || data.cameraSensitivity > 2) throw new Error('镜头设置无效');
  return { quality: data.quality, volume: data.volume, cameraSensitivity: data.cameraSensitivity };
}

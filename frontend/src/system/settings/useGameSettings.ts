import { useState } from 'react';
import { decodeGameSettings, DEFAULT_GAME_SETTINGS, type GameSettings } from './GameSettings';

const STORAGE_KEY = 'bloom-valley:settings:v1';
function readSettings(): GameSettings {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? decodeGameSettings(JSON.parse(raw)) : DEFAULT_GAME_SETTINGS; }
  catch { return DEFAULT_GAME_SETTINGS; }
}
export function useGameSettings() {
  const [settings, setSettings] = useState(readSettings);
  const [warning, setWarning] = useState<string | null>(null);
  const updateSettings = (next: GameSettings) => {
    const valid = decodeGameSettings(next);
    setSettings(valid);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(valid)); setWarning(null); }
    catch { setWarning('当前浏览器无法记住设置；本次游玩仍会使用这些选项。'); }
  };
  return { settings, updateSettings, warning };
}

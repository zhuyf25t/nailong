import { useCallback, useEffect, useState } from 'react';
import type { PlayerId } from '../../../objects/player/PlayerId.ts';
import { decodeFavorites } from '../functions/archive.ts';

/** Bookmarks are device-local preferences, namespaced by account, never server grades. */
export function useFavorites(playerId: PlayerId | undefined) {
  const key = playerId ? `nailong:bookmarks:v1:${playerId}` : null;
  const [state, setState] = useState<{ key: string | null; ids: readonly string[] }>({ key: null, ids: [] });
  const [warning, setWarning] = useState<string | null>(null);
  useEffect(() => {
    setWarning(null);
    if (!key) { setState({ key, ids: [] }); return; }
    try { const raw = localStorage.getItem(key); setState({ key, ids: raw ? decodeFavorites(JSON.parse(raw)) : [] }); }
    catch { setState({ key, ids: [] }); setWarning('本机收藏暂时无法读取，原始存储未被删除。'); }
  }, [key]);
  const ids = state.key === key ? state.ids : [];
  const toggle = useCallback((id: string) => {
    if (!key) return;
    setState(current => {
      const previous = current.key === key ? current.ids : [];
      const next = previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id].slice(-2000);
      try { localStorage.setItem(key, JSON.stringify(next)); setWarning(null); }
      catch { setWarning('无法写入本机收藏；本次页面内的标记仍然保留。'); }
      return { key, ids: next };
    });
  }, [key]);
  return { ids, toggle, warning };
}

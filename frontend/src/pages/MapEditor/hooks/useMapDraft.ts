import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { GetMapDraftAPI } from '../../../apis/worlds/GetMapDraftAPI';
import { SaveMapDraftAPI } from '../../../apis/worlds/SaveMapDraftAPI';
import { CreateMapVersionAPI } from '../../../apis/worlds/CreateMapVersionAPI';
import { parseMapId } from '../../../objects/worlds/MapId';
import type { MapDraft } from '../../../objects/worlds/MapDraft';
import type { MapVersion } from '../../../objects/worlds/MapVersion';
import type { WorldDefinition } from '../../../objects/worlds/WorldDefinition';
import { validateWorld } from '../../../objects/worlds/validateWorld';
import { useSession } from '../../../system/session/SessionProvider';
import { ApiError } from '../../../system/api/ApiError';
import { editorHistoryReducer, EMPTY_HISTORY, type WorldEdit } from '../functions/editorHistory';

type Recovery = { draft: MapDraft; world: WorldDefinition };
// Keeps an unsaved edit if the browser back button briefly unmounts the route before a cancelled navigation returns.
const recovery = new Map<string, Recovery>();
export function useMapDraft(rawMapId: string | undefined) {
  const { state: session } = useSession();
  const owner = session.kind === 'signed-in' ? session.player.id : null;
  const token = session.kind === 'signed-in' ? session.token : null;
  const recoveryKey = `${owner ?? 'guest'}:${rawMapId ?? ''}`;
  const [draft, setDraft] = useState<MapDraft | null>(null);
  const [history, dispatch] = useReducer(editorHistoryReducer, EMPTY_HISTORY);
  const world = history.present;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState<'save' | 'freeze' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [version, setVersion] = useState<MapVersion | null>(null);
  const [reload, setReload] = useState(0);
  const lock = useRef(false), active = useRef(true), generation = useRef(0), leavingConfirmed = useRef(false);
  const loadedRecoveryKey = useRef(recoveryKey);
  const latest = useRef({ draft, world, recoveryKey }); latest.current = { draft, world, recoveryKey };
  const dirty = !!draft && !!world && JSON.stringify(world) !== JSON.stringify(draft.world);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; const value = latest.current; if (value.draft && value.world && dirtyRef.current && !leavingConfirmed.current) recovery.set(loadedRecoveryKey.current, { draft: value.draft, world: value.world }); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(), request = ++generation.current;
    const previous = latest.current;
    if (previous.draft && previous.world && JSON.stringify(previous.draft.world) !== JSON.stringify(previous.world) && !leavingConfirmed.current) recovery.set(loadedRecoveryKey.current, { draft: previous.draft, world: previous.world });
    loadedRecoveryKey.current = recoveryKey;
    setStatus('loading'); setError(null); setMessage(null); setDraft(null); dispatch({ type: 'load', world: null }); setVersion(null); setConflict(false); setBusy(null); lock.current = false; leavingConfirmed.current = false;
    let mapId;
    try { mapId = parseMapId(rawMapId); } catch { setStatus('error'); setError('地图地址不完整，请从创作工坊选择作品。'); return; }
    if (!token) { setStatus('error'); setError('登录后才能编辑自己的地图。'); return; }
    new GetMapDraftAPI(mapId).send({ token, signal: controller.signal }).then(value => {
      if (request !== generation.current || controller.signal.aborted) return;
      const restored = recovery.get(recoveryKey);
      setDraft(restored?.draft ?? value); dispatch({ type: 'load', world: restored?.world ?? value.world }); setStatus('ready');
      if (restored) { setMessage('已找回这次页面访问中尚未保存的修改。'); if (restored.draft.revision !== value.revision) { setConflict(true); setError('服务器上已有更新的草稿。当前修改仍保留，请先导出备份，再重新载入。'); } }
    }).catch(reason => { if (!controller.signal.aborted && request === generation.current) { setStatus('error'); setError(reason instanceof Error ? reason.message : '地图暂时无法读取。'); } });
    return () => controller.abort();
  }, [rawMapId, token, recoveryKey, reload]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const next = new URL(anchor.href, location.href);
      if (next.href === location.href || (next.pathname === location.pathname && next.search === location.search)) return;
      if (!window.confirm('地图还有未保存的修改。确定离开吗？')) { event.preventDefault(); event.stopPropagation(); }
      else { leavingConfirmed.current = true; recovery.delete(recoveryKey); }
    };
    const index = window.history.state?.idx as number | undefined;
    const pop = () => {
      if (window.history.state?.idx === index) return;
      if (!window.confirm('地图还有未保存的修改。确定离开吗？')) {
        const current = window.history.state?.idx as number | undefined;
        if (typeof index === 'number' && typeof current === 'number' && index !== current) window.history.go(index - current);
      } else { leavingConfirmed.current = true; recovery.delete(recoveryKey); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', click, true); window.addEventListener('popstate', pop);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true); window.removeEventListener('popstate', pop); };
  }, [dirty, recoveryKey]);
  const edit = useCallback((next: WorldEdit) => {
    if (lock.current) return;
    dispatch({ type: 'edit', edit: next });
    setMessage(null); setVersion(null);
  }, []);
  const undo = () => { if (lock.current) return; dispatch({ type: 'undo' }); setVersion(null); };
  const redo = () => { if (lock.current) return; dispatch({ type: 'redo' }); setVersion(null); };
  const persist = async (freeze: boolean) => {
    if (lock.current || !draft || !world || !token) return null;
    const issues = validateWorld(world);
    if (issues.length) { setError('请先修复地图检查中列出的问题。'); return null; }
    const request = generation.current;
    lock.current = true; setBusy(freeze ? 'freeze' : 'save'); setError(null); setMessage(null);
    try {
      const saved = dirty ? await new SaveMapDraftAPI({ mapId: draft.mapId, expectedRevision: draft.revision, title: world.title.trim(), world: { ...world, title: world.title.trim() } }).send({ token }) : draft;
      if (!active.current || request !== generation.current) return null;
      setDraft(saved); dispatch({ type: 'saved', world: saved.world }); setConflict(false); recovery.delete(recoveryKey);
      if (!freeze) { setMessage(`已保存草稿 · 修订 ${saved.revision}`); return null; }
      const frozen = await new CreateMapVersionAPI(saved.mapId, saved.revision).send({ token });
      if (!active.current || request !== generation.current) return null;
      setVersion(frozen); setMessage(`版本 v${frozen.version} 已冻结。以后编辑不会改变这份版本。`); return frozen;
    } catch (reason) {
      if (active.current && request === generation.current) {
        const changed = reason instanceof ApiError && (reason.code === 'conflict' || reason.status === 409);
        setConflict(changed); setError(changed ? '另一处已经修改了这张地图。你的编辑还在，请导出备份，或确认放弃本地修改后重新载入。' : reason instanceof Error ? reason.message : '保存失败，当前修改仍然保留。');
      }
      return null;
    } finally { if (request === generation.current) { lock.current = false; if (active.current) setBusy(null); } }
  };
  const reloadDraft = () => { if (dirty && !window.confirm('重新载入会放弃当前未保存的修改。确定继续吗？')) return; leavingConfirmed.current = true; recovery.delete(recoveryKey); setReload(value => value + 1); };
  return { draft, world, status, busy, error, message, conflict, version, dirty, edit, undo, redo, canUndo: !!history.past.length, canRedo: !!history.future.length, save: () => persist(false), freeze: () => persist(true), reloadDraft };
}

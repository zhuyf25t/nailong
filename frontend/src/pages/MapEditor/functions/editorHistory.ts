import type { WorldDefinition } from '../../../objects/worlds/WorldDefinition';
export type WorldEdit = WorldDefinition | ((current: WorldDefinition) => WorldDefinition);
export interface EditorHistory { readonly present: WorldDefinition | null; readonly past: readonly WorldDefinition[]; readonly future: readonly WorldDefinition[]; }
export type EditorHistoryAction = { type: 'load'; world: WorldDefinition | null } | { type: 'saved'; world: WorldDefinition } | { type: 'edit'; edit: WorldEdit } | { type: 'undo' } | { type: 'redo' };
export const EMPTY_HISTORY: EditorHistory = { present: null, past: [], future: [] };
/** All changes resolve against the latest state, including a drag committed after another edit. */
export function editorHistoryReducer(state: EditorHistory, action: EditorHistoryAction): EditorHistory {
  if (action.type === 'load') return { present: action.world, past: [], future: [] };
  if (action.type === 'saved') return { ...state, present: action.world };
  if (!state.present) return state;
  if (action.type === 'undo') return !state.past.length ? state : { present: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [state.present, ...state.future] };
  if (action.type === 'redo') return !state.future.length ? state : { present: state.future[0], past: [...state.past.slice(-49), state.present], future: state.future.slice(1) };
  const next = typeof action.edit === 'function' ? action.edit(state.present) : action.edit;
  return JSON.stringify(next) === JSON.stringify(state.present) ? state : { present: next, past: [...state.past.slice(-49), state.present], future: [] };
}

import type { TerrainConfig } from '../../../objects/training/TerrainConfig';
const fields = [
  { key: 'hillHeight', label: '山丘高度', min: 0, max: 4, step: .1, suffix: ' m' },
  { key: 'hillWidth', label: '山丘宽度', min: 2.5, max: 9, step: .1, suffix: ' m' },
  { key: 'hillX', label: '山丘东西位置', min: -8, max: 8, step: .5, suffix: ' m' },
  { key: 'hillZ', label: '山丘南北位置', min: -8, max: 8, step: .5, suffix: ' m' },
  { key: 'ripple', label: '草地起伏', min: 0, max: .8, step: .05, suffix: '' },
] as const;
export function TerrainControls({ terrain, onChange, disabled }: { terrain: TerrainConfig; onChange: (terrain: TerrainConfig) => void; disabled: boolean }) {
  return <details className="border-t border-line pt-5"><summary className="min-h-11 text-sm font-semibold">自定义这片花谷 <span className="ml-2 text-xs font-normal text-muted">调整地形</span></summary><div className="mt-3 space-y-4">{fields.map(field => <label key={field.key} className="block"><span className="flex justify-between text-xs text-muted">{field.label}<output>{terrain[field.key].toFixed(2)}{field.suffix}</output></span><input aria-label={field.label} className="mt-2 h-6 w-full" type="range" min={field.min} max={field.max} step={field.step} value={terrain[field.key]} disabled={disabled} onChange={event => onChange({ ...terrain, [field.key]: Number(event.target.value) })} /></label>)}<p className="text-xs leading-6 text-muted">地形在本局开始后固定。最快通关只比较相同地形和规则的挑战。</p></div></details>;
}

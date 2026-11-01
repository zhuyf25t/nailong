import { DEFAULT_TERRAIN_CONFIG, type TerrainConfig } from './terrain';

const fields: Array<{ key: keyof TerrainConfig; label: string; min: number; max: number; step: number }> = [
  { key: 'hillHeight', label: '山丘高度', min: 0, max: 4, step: 0.05 },
  { key: 'hillWidth', label: '山坡宽度', min: 2.5, max: 9, step: 0.1 },
  { key: 'hillX', label: '山丘左右位置', min: -8, max: 8, step: 0.5 },
  { key: 'hillZ', label: '山丘前后位置', min: -8, max: 8, step: 0.5 },
  { key: 'ripple', label: '草地起伏', min: 0, max: 0.8, step: 0.01 },
];
export function parseTerrainFile(value: unknown): TerrainConfig {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('terrain' in value)) throw new Error('请选择本游戏导出的地形 JSON（版本 1）');
  const terrain = value.terrain;
  if (!terrain || typeof terrain !== 'object') throw new Error('地形参数不完整');
  const result = { ...DEFAULT_TERRAIN_CONFIG };
  for (const { key, min, max } of fields) {
    const n = (terrain as Record<string, unknown>)[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`${key} 超出允许范围 ${min}–${max}`);
    result[key] = n;
  }
  return result;
}
export function terrainKey(config: TerrainConfig) {
  return fields.map(({ key }) => config[key].toFixed(2)).join('/');
}
export function createTerrainEditor(parent: HTMLElement, initial: TerrainConfig, onChange: (config: TerrainConfig) => void, onClose: () => void) {
  const panel = document.createElement('aside'); panel.className = 'terrain-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', '自定义地形');
  panel.innerHTML = `<div class="panel-heading"><span class="eyebrow">MY LITTLE VALLEY</span><button class="panel-close" aria-label="关闭地形编辑">×</button></div><h2>捏一座小山。</h2><p>拖动滑块看看变化，再回到花园走一走。出生区域始终保持平坦。</p><div class="terrain-fields">${fields.map(f => `<label for="terrain-${f.key}"><span>${f.label}</span><output id="value-${f.key}"></output></label><input id="terrain-${f.key}" data-key="${f.key}" type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${initial[f.key]}"/>`).join('')}</div><div class="terrain-presets"><button data-preset="valley">花谷</button><button data-preset="flat">平地</button><button data-preset="hill">小山丘</button></div><div class="panel-actions"><button id="terrain-save" class="button dark">保存到本机</button><button id="terrain-export" class="button subtle">导出地图</button><button id="terrain-import" class="button subtle">导入地图</button></div><input id="terrain-file" type="file" accept=".json,application/json" hidden/><p id="terrain-status" role="status">编辑时暂停游戏；挑战中地图锁定。</p><button class="button dark large" id="terrain-play">回到花园试玩 →</button>`;
  parent.append(panel);
  let config = { ...initial };
  const status = panel.querySelector<HTMLElement>('#terrain-status')!;
  function sync() {
    fields.forEach(({ key }) => { panel.querySelector<HTMLInputElement>(`#terrain-${key}`)!.value = String(config[key]); panel.querySelector(`output#value-${key}`)!.textContent = config[key].toFixed(2); });
  }
  function apply(value: TerrainConfig) { config = { ...value }; sync(); onChange(config); }
  panel.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(input => input.addEventListener('input', () => {
    config[input.dataset.key as keyof TerrainConfig] = Number(input.value); sync(); onChange({ ...config }); status.textContent = '地形已更新，角色与道具会贴合新地面。';
  }));
  panel.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(button => button.onclick = () => apply(button.dataset.preset === 'flat'
    ? { ...DEFAULT_TERRAIN_CONFIG, hillHeight: 0, ripple: 0 }
    : button.dataset.preset === 'hill' ? { ...DEFAULT_TERRAIN_CONFIG, hillHeight: 3.4, hillWidth: 5.8, hillX: -5, hillZ: -3 } : DEFAULT_TERRAIN_CONFIG));
  panel.querySelector<HTMLButtonElement>('#terrain-save')!.onclick = () => {
    try { localStorage.setItem('nailong-terrain-v1', JSON.stringify({ version: 1, terrain: config })); status.textContent = '已保存在本机，下次打开自动恢复。'; }
    catch { status.textContent = '浏览器无法保存；可以导出地图文件。'; }
  };
  panel.querySelector<HTMLButtonElement>('#terrain-export')!.onclick = () => {
    const blob = new Blob([JSON.stringify({ version: 1, terrain: config }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'my-nailong-valley.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = '已导出地图参数，可用“导入地图”重新打开。';
  };
  const file = panel.querySelector<HTMLInputElement>('#terrain-file')!;
  panel.querySelector<HTMLButtonElement>('#terrain-import')!.onclick = () => file.click();
  file.onchange = async () => {
    try { const chosen = file.files?.[0]; if (!chosen) return; if (chosen.size > 10000) throw new Error('地图参数文件应小于 10 KB'); apply(parseTerrainFile(JSON.parse(await chosen.text()))); status.textContent = '地图已导入，可立即试玩。'; }
    catch (error) { status.textContent = error instanceof Error ? error.message : '地图读取失败'; }
    finally { file.value = ''; }
  };
  panel.querySelector<HTMLButtonElement>('.panel-close')!.onclick = onClose;
  panel.querySelector<HTMLButtonElement>('#terrain-play')!.onclick = onClose;
  sync();
  return { open() { panel.hidden = false; }, close() { panel.hidden = true; }, getConfig: () => ({ ...config }) };
}

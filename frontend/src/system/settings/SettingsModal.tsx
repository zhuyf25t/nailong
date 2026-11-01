import { Volume2, SlidersHorizontal, Monitor } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import type { GameSettings } from './GameSettings';
export function SettingsModal({ open, onOpenChange, settings, update, warning }: { open: boolean; onOpenChange: (open: boolean) => void; settings: GameSettings; update: (settings: GameSettings) => void; warning: string | null }) {
  return <Modal open={open} onOpenChange={onOpenChange} title="让冒险更顺手" description="设置会在这台设备上记住。游戏中修改设置时，行动会暂停。">
    <div className="space-y-7">
      <fieldset><legend className="mb-3 flex items-center gap-2 text-sm font-semibold"><Monitor size={17} />画面质量</legend><div className="grid grid-cols-2 gap-3">{(['low', 'high'] as const).map(quality => <label key={quality} className={`cursor-pointer rounded-2xl border p-4 ${settings.quality === quality ? 'border-primary bg-primary/5' : 'border-line'}`}><input className="mr-2 accent-primary" type="radio" name="quality" value={quality} checked={settings.quality === quality} onChange={() => update({ ...settings, quality })} />{quality === 'high' ? '细腻' : '轻盈'}<span className="mt-2 block text-xs leading-5 text-muted">{quality === 'high' ? '完整植被与柔和阴影' : '减少装饰、降低渲染负担'}</span></label>)}</div></fieldset>
      <label className="block"><span className="mb-4 flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-2"><Volume2 size={17} />游戏音量</span><output>{Math.round(settings.volume * 100)}%</output></span><input aria-label="游戏音量" className="h-6 w-full" type="range" min="0" max="1" step=".05" value={settings.volume} onChange={e => update({ ...settings, volume: Number(e.target.value) })} /></label>
      <label className="block"><span className="mb-4 flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-2"><SlidersHorizontal size={17} />边缘转向速度</span><output>{settings.cameraSensitivity.toFixed(1)}×</output></span><input aria-label="边缘转向速度" className="h-6 w-full" type="range" min=".5" max="2" step=".1" value={settings.cameraSensitivity} onChange={e => update({ ...settings, cameraSensitivity: Number(e.target.value) })} /></label>
      <p className="rounded-xl bg-paper p-3 text-xs leading-6 text-muted">镜头远近可在游戏中滚轮缩放；手机使用画面里的缩放按钮。音效在你第一次操作后启用。</p>
      {warning && <p role="status" className="text-sm text-danger">{warning}</p>}
    </div>
  </Modal>;
}

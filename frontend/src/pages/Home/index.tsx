import { ArrowRight, BookOpen, Crosshair, Flag, GraduationCap, Leaf, Play, Settings, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../components/ui/Modal';

export default function Home({ enter, openSettings }: { enter: (destination: string) => void; openSettings: () => void }) {
  const [helpOpen, setHelpOpen] = useState(false);
  return <main className="mx-auto max-w-[1440px] px-4 pb-6 sm:px-7 lg:px-10">
    <section className="grid overflow-hidden rounded-[28px] border border-line/60 bg-surface shadow-[0_18px_70px_#214b3410] md:min-h-[620px] md:grid-cols-[1.15fr_1fr] lg:grid-cols-[1.45fr_1fr]">
      <div className="relative min-h-[180px] overflow-hidden bg-[#a7c775] sm:min-h-80 md:min-h-full">
        <img src="/art/menu-garden.png" alt="奶龙拿着玩具枪站在阳光下的花园里，周围是木箱、草地与花朵。" className="absolute inset-0 h-full w-[150%] max-w-none object-cover object-left" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#143e2e]/55 to-transparent" />
        <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-3 text-white sm:bottom-8 sm:left-8"><div><p className="mb-2 hidden text-[10px] font-semibold tracking-[.26em] sm:block">A LITTLE GARDEN. A LITTLE ADVENTURE.</p><p className="text-base font-medium sm:text-lg">出发吧，花谷正在等你。</p></div><span className="whitespace-nowrap rounded-full border border-white/40 bg-white/15 px-3 py-1.5 text-[9px] backdrop-blur sm:text-[10px]">花谷概念插画</span></div>
      </div>
      <div className="flex flex-col justify-center px-6 py-6 sm:px-10 sm:py-9 lg:px-12">
        <span className="mb-5 flex items-center gap-2 text-[11px] font-semibold tracking-[.23em] text-primary"><Leaf size={15} /> THE GARDEN CAMP</span>
        <h1 className="text-[2rem] font-black leading-tight tracking-tight sm:text-[2.4rem] lg:text-5xl">奶龙小靶场<span className="mt-3 block text-base font-medium tracking-normal text-muted sm:text-lg">小小的你，也能完成大冒险。</span></h1>
        <p className="mt-4 max-w-sm text-xs leading-6 text-muted sm:mt-6 sm:text-sm sm:leading-7">绕过巡逻，点亮林间信标，再平安返回。带上一件小工具，试试属于你的路线。</p>
        <div className="my-6 hidden items-center gap-4 border-y border-line py-4 text-xs text-muted sm:flex"><span className="flex items-center gap-1.5"><Flag size={15} />激活与撤离</span><span className="flex items-center gap-1.5"><Crosshair size={15} />扫描追击</span><span className="flex items-center gap-1.5"><ShieldCheck size={15} />单人行动</span></div>
        <div className="mt-6 space-y-3 sm:mt-0"><Link to="/missions/forest-beacon/loadout" className="flex min-h-15 w-full items-center justify-between rounded-2xl bg-primary px-6 py-4 text-base font-semibold text-white shadow-[0_5px_0_#103f3920] hover:bg-primary-hover"><span className="flex items-center gap-3"><Play size={20} fill="currentColor" />前往林间信标</span><ArrowRight size={20} /></Link><Link to="/missions" className="flex min-h-13 w-full items-center justify-between rounded-2xl border border-line bg-surface px-6 py-3 text-sm font-semibold hover:bg-white"><span className="flex items-center gap-3"><Flag size={19} />挑选其他任务</span><ArrowRight size={17} /></Link></div>
        <div className="mt-4 grid grid-cols-2 gap-2"><Link to="/academy" className="flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs text-muted hover:bg-ink/5 hover:text-primary"><GraduationCap size={17} />先上 30 秒小课</Link><button onClick={() => enter('/history')} className="flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs text-muted hover:bg-ink/5 hover:text-primary"><BookOpen size={16} />我的行动手记</button></div>
        <Link to="/training?practice=1&mission=forest-beacon&tool=curtain" className="mt-1 min-h-11 self-center rounded-lg px-3 py-3 text-xs text-muted underline decoration-line underline-offset-4 hover:text-primary">自由探索 · 不登录，不保存成绩</Link>
        <div className="mt-3 flex justify-center gap-5 border-t border-line pt-3"><button onClick={openSettings} className="flex min-h-11 items-center gap-2 px-2 text-sm text-muted hover:text-primary"><Settings size={17} />设置</button><button onClick={() => setHelpOpen(true)} className="min-h-11 px-2 text-sm text-muted hover:text-primary">操作指南</button></div>
      </div>
    </section>
    <footer className="flex flex-wrap items-center justify-between gap-2 px-2 pt-5 text-[11px] text-muted"><p>营地 · 花谷里每次出发的起点</p><p>正式行动、过程记录与地图作品归你的账号保存</p></footer>
    <Modal open={helpOpen} onOpenChange={setHelpOpen} title="花谷行动指南" description="先挑选任务，再决定这次带哪件小工具。">
      <ol className="space-y-4 text-sm leading-7"><li><strong>01 · 看清本局目标。</strong> 林间信标需要靠近目标、按 E 激活，再进入撤离区；清场任务则需要击毁全部无人机。</li><li><strong>02 · 用好掩体与工具。</strong> 红色扇区是扫描范围。实体掩体能挡住扫描；每局带一件工具，按 Q 使用一次。</li><li><strong>03 · 安全回来。</strong> 发现你以后，无人机会持续追击。接触爆炸会结束行动；暂停后可以从原处继续。</li></ol>
      <div className="mt-6 rounded-2xl bg-paper p-4 text-xs leading-7 text-muted">电脑：W A S D 移动，空格跳跃，左键射击，Q 使用工具，E 交互。蓝框外转向，滚轮缩放，Esc 暂停。<br />手机：使用摇杆、瞄准区以及射击、跳跃、工具和交互按钮。</div>
      <Link to="/academy" onClick={() => setHelpOpen(false)} className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-white"><GraduationCap size={18} />在小课里亲手试一试<ArrowRight size={16} /></Link>
    </Modal>
  </main>;
}

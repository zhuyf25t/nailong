import { ArrowRight, BookOpen, Crosshair, Leaf, Play, Settings, ShieldCheck, Target } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

export default function Home({ enter, openSettings }: { enter: (destination: string) => void; openSettings: () => void }) {
  const [helpOpen, setHelpOpen] = useState(false);
  return <main className="mx-auto max-w-[1440px] px-4 pb-6 sm:px-7 lg:px-10">
    <section className="grid overflow-hidden rounded-[28px] border border-line/60 bg-surface shadow-[0_18px_70px_#214b3410] md:min-h-[640px] md:grid-cols-[1.15fr_1fr] lg:grid-cols-[1.45fr_1fr]">
      <div className="relative min-h-[180px] overflow-hidden bg-[#a7c775] sm:min-h-80 md:min-h-full">
        <img src="/art/menu-garden.png" alt="奶龙拿着玩具枪站在阳光下的花园里，周围是木箱、草地与花朵。" className="absolute inset-0 h-full w-[150%] max-w-none object-cover object-left" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#143e2e]/55 to-transparent" />
        <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-3 text-white sm:bottom-8 sm:left-8"><div><p className="mb-2 hidden text-[10px] font-semibold tracking-[.26em] sm:block">A LITTLE GARDEN. A LITTLE ADVENTURE.</p><p className="text-base font-medium sm:text-lg">今天，也要勇敢一点。</p></div><span className="whitespace-nowrap rounded-full border border-white/40 bg-white/15 px-3 py-1.5 text-[9px] sm:text-[10px] backdrop-blur">花谷概念插画</span></div>
      </div>
      <div className="flex flex-col justify-center px-6 py-6 sm:px-10 sm:py-9 lg:px-12">
        <span className="mb-5 flex items-center gap-2 text-[11px] font-semibold tracking-[.23em] text-primary"><Leaf size={15} /> BLOOM VALLEY · SOLO</span>
        <h1 className="text-[2rem] font-black sm:text-[2.4rem] leading-tight tracking-tight lg:text-5xl">奶龙小靶场<span className="mt-3 block text-base font-medium sm:text-lg tracking-normal text-muted">躲开红光，守住这片花谷。</span></h1>
        <p className="mt-4 line-clamp-2 max-w-sm text-xs leading-6 text-muted sm:mt-6 sm:line-clamp-none sm:text-sm sm:leading-7">四架无人机悄悄闯进花谷。找好掩体、避开扫描，用你的脉冲枪把它们全部击落。</p>
        <div className="my-7 hidden items-center gap-4 sm:flex border-y border-line py-4 text-xs text-muted"><span className="flex items-center gap-1.5"><Target size={15} />四机清场</span><span className="flex items-center gap-1.5"><Crosshair size={15} />扫描追击</span><span className="flex items-center gap-1.5"><ShieldCheck size={15} />单人挑战</span></div>
        <div className="mt-6 space-y-3 sm:mt-0"><Button className="min-h-15 w-full justify-between px-6 text-base" onClick={() => enter('/training')}><span className="flex items-center gap-3"><Play size={20} fill="currentColor" />开始挑战</span><ArrowRight size={20} /></Button><Button className="min-h-13 w-full justify-between px-6" variant="secondary" onClick={() => enter('/history')}><span className="flex items-center gap-3"><BookOpen size={19} />我的记录</span><ArrowRight size={17} /></Button></div>
        <Link to="/training?practice=1" className="mt-5 min-h-11 self-center rounded-lg px-4 py-3 text-xs text-muted underline decoration-line underline-offset-4 hover:text-primary">先自由练习 · 无需登录，不保存成绩</Link>
        <div className="mt-5 flex justify-center gap-5 border-t border-line pt-5"><button onClick={openSettings} className="flex min-h-11 items-center gap-2 px-2 text-sm text-muted hover:text-primary"><Settings size={17} />设置</button><button onClick={() => setHelpOpen(true)} className="min-h-11 px-2 text-sm text-muted hover:text-primary">怎么玩？</button></div>
      </div>
    </section>
    <footer className="flex flex-wrap items-center justify-between gap-2 px-2 pt-5 text-[11px] text-muted"><p>花谷巡猎 · 为一次小小的胜利出发</p><p>单人个人训练 · 成绩保存在你的账号</p></footer>
    <Modal open={helpOpen} onOpenChange={setHelpOpen} title="花谷行动指南" description="没有倒计时压力；四架全部击毁就是胜利。">
      <ol className="space-y-4 text-sm leading-7"><li><strong>01 · 躲开红光。</strong> 无人机视野是红色扇区，箱子和山坡可以遮挡扫描；被看到后，它会追来。</li><li><strong>02 · 抓住机会。</strong> 每架需要命中三次。尚未发现你的无人机挨打后会高速搜索；已经锁定你的敌机会继续追击。边移动边寻找掩体。</li><li><strong>03 · 保持距离。</strong> 接触无人机会触发爆炸，本局立即结束。可以随时暂停，再来一次。</li></ol>
      <div className="mt-6 rounded-2xl bg-paper p-4 text-xs leading-7 text-muted">电脑：W A S D 移动，空格跳跃，左键射击。鼠标超出蓝框转向，滚轮缩放，Esc 暂停。<br />手机：左侧摇杆移动，右侧瞄准区转向，射击和跳跃按钮分别操作。</div>
    </Modal>
  </main>;
}

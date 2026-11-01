import type { ToolDescription } from '../objects/ToolDescription.ts';

export const toolDescriptions: readonly ToolDescription[] = [
  { kind: 'curtain', name: '干扰幕', subtitle: '给转身，留一点空间',
    effect: '暂时挡住无人机的视线。放下后向侧面换位，让追击者去你最后出现的位置。',
    constraint: '不挡身体和子弹，也不会立即解除追击。太近时，仍然可能被撞到。', specs: '半径 3 m · 持续 4 秒' },
  { kind: 'decoy', name: '诱饵信标', subtitle: '让它们先看向另一边',
    effect: '向前放置一枚信标，吸引附近巡逻或搜索中的无人机，给自己打开一条路。',
    constraint: '看得见你的追击者会优先追你。先转入掩体，再利用诱饵更有效。', specs: '吸引范围 8 m · 持续 5 秒' },
  { kind: 'pulse', name: '排斥脉冲', subtitle: '拉开距离，再找掩体',
    effect: '推开近处、无遮挡的无人机，短暂停住它们，争取重新走位的时间。',
    constraint: '不造成伤害，也不能隔墙推开敌机。短暂停顿后，无人机会继续行动。', specs: '作用范围 5 m · 最多推开 2.4 m' },
  { kind: 'none', name: '轻装出发', subtitle: '只依靠观察与走位',
    effect: '不携带战术工具，仍然拥有脉冲枪。通过射击、掩体与扫描间隙完成任务。',
    constraint: '本局没有一次性的脱身工具。准备好路线再出发。', specs: '不携带工具 · 武器保留' },
];

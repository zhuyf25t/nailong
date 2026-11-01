import type { RunEvent } from './RunEvent.ts';
export function runEventLabel(event: RunEvent): string {
    switch (event.kind) {
        case 'shot': return '发射脉冲';
        case 'hit': return '命中无人机';
        case 'destroyed': return '无人机被击落';
        case 'contact': return '无人机接触角色';
        case 'beacon': return '信标已启动';
        case 'gate': return '捷径门已打开';
        case 'extract': return '抵达撤离区';
        case 'round-end': return event.detail === 'victory' ? '行动成功' : '行动结束';
        case 'tool': return event.detail === 'curtain' ? '释放干扰幕' : event.detail === 'decoy' ? '放置诱饵' : '释放脉冲';
        case 'drone-state': return event.detail?.startsWith('locked') ? '无人机发现角色' : event.detail === 'alert:hit-unaware' ? '受击后开始搜索' : event.detail === 'alert:lost-sight' ? '失去视线，转入搜索' : '无人机恢复巡逻';
    }
}

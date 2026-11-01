import { useId, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { WorldDefinition } from '../../../objects/worlds/WorldDefinition';
import { snapPoint, type EditorPoint, type EditorTool } from '../functions/editWorld';

interface Props {
  world: WorldDefinition; selection?: string | null; tool?: EditorTool; invalidIds?: ReadonlySet<string>;
  onSelect?(selection: string): void; onPlace?(point: EditorPoint): void; onMove?(selection: string, point: EditorPoint): void;
  compact?: boolean;
}
const colors = { crate: '#a67a4e', barrel: '#b48a53', wall: '#7b9186', gate: '#61a6a4' };

/** The same immutable world drives this planning view and the real game preview. */
export function WorldCanvas({ world, selection, tool = 'select', invalidIds, onSelect, onPlace, onMove, compact = false }: Props) {
  const uid = useId().replace(/:/g, '');
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ key: string; start: EditorPoint; moved: boolean } | null>(null);
  const [moving, setMoving] = useState<{ key: string; point: EditorPoint } | null>(null);
  const half = world.bounds.halfSize;
  const pointAt = (event: ReactPointerEvent): EditorPoint => {
    const bounds = svg.current!.getBoundingClientRect(), scale = Math.min(bounds.width, bounds.height) / (half * 2);
    return snapPoint({ x: (event.clientX - bounds.left - bounds.width / 2) / scale, z: (event.clientY - bounds.top - bounds.height / 2) / scale }, half);
  };
  const position = (key: string, point: EditorPoint) => moving?.key === key ? moving.point : point;
  const select = (event: ReactPointerEvent, key: string) => {
    if (!onSelect) return;
    event.stopPropagation(); onSelect(key);
    if (tool === 'select') { const p = pointAt(event); drag.current = { key, start: p, moved: false }; svg.current?.setPointerCapture(event.pointerId); }
  };
  const move = (event: ReactPointerEvent) => {
    if (!drag.current) return;
    const p = pointAt(event); if (p.x !== drag.current.start.x || p.z !== drag.current.start.z) drag.current.moved = true;
    if (drag.current.moved) setMoving({ key: drag.current.key, point: p });
  };
  const end = (event: ReactPointerEvent) => {
    if (drag.current?.moved) onMove?.(drag.current.key, pointAt(event));
    drag.current = null; setMoving(null);
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
  };
  const outline = (key: string, id?: string) => selection === key ? '#116b73' : id && invalidIds?.has(id) ? '#c45243' : '#ffffff90';
  const sw = compact ? .14 : .2;
  const marker = (kind: 'beacon' | 'extraction') => {
    const raw = world[kind], p = position(kind, raw), color = kind === 'beacon' ? '#d49d31' : '#5b987a';
    return <g key={kind} onPointerDown={event => select(event, kind)} style={{ cursor: onSelect ? 'grab' : undefined }}><circle cx={p.x} cy={p.z} r={raw.radius} fill={color} fillOpacity={.18} stroke={outline(kind, raw.id)} strokeWidth={selection === kind ? .3 : sw} strokeDasharray={kind === 'extraction' ? '.4 .3' : undefined} /><circle cx={p.x} cy={p.z} r={.38} fill={color} /><text x={p.x} y={p.z - raw.radius - .35} textAnchor="middle" fontSize={compact ? 1.1 : .85} fill="#456052">{kind === 'beacon' ? '信标' : '撤离'}</text></g>;
  };
  const player = position('spawn', world.spawn);
  return <svg ref={svg} viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`} role="img" aria-label={compact ? `${world.title} 地图预览` : '可编辑的花谷俯视地图，选择工具后点击空地放置，选中物体可拖动'} className={`block aspect-square w-full select-none ${onPlace ? 'touch-none' : ''}`} onPointerDown={event => { if (onPlace && event.target === event.currentTarget) onPlace(pointAt(event)); }} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { drag.current = null; setMoving(null); }}>
    <defs><radialGradient id={`${uid}-hill`}><stop offset="0" stopColor="#79a372" stopOpacity=".65" /><stop offset="1" stopColor="#79a372" stopOpacity="0" /></radialGradient><pattern id={`${uid}-grid`} width="2" height="2" patternUnits="userSpaceOnUse"><path d="M 2 0 L 0 0 0 2" fill="none" stroke="#55745d" strokeOpacity=".12" strokeWidth=".045" /></pattern></defs>
    <rect x={-half} y={-half} width={2 * half} height={2 * half} fill="#e8eddc" pointerEvents="none" />
    <circle cx={world.terrain.hillX} cy={world.terrain.hillZ} r={world.terrain.hillWidth * 1.8} fill={`url(#${uid}-hill)`} opacity={.25 + world.terrain.hillHeight / 5} pointerEvents="none" />
    {!compact && <rect x={-half} y={-half} width={2 * half} height={2 * half} fill={`url(#${uid}-grid)`} pointerEvents="none" />}
    <rect x={-half + .2} y={-half + .2} width={2 * half - .4} height={2 * half - .4} rx=".5" fill="none" stroke="#98b093" strokeWidth=".2" strokeDasharray=".4 .4" pointerEvents="none" />
    {world.drones.map(d => { const key = `drone:${d.id}`, p = position(key, d); return <g key={`patrol-${d.id}`}><polyline points={[p, ...d.patrol.map((v, i) => position(`patrol:${d.id}:${i}`, v)), ...(d.patrol.length > 1 ? [d.patrol[0]] : [])].map(v => `${v.x},${v.z}`).join(' ')} fill="none" stroke="#b96052" strokeOpacity={.4} strokeWidth=".15" strokeDasharray=".4 .3" pointerEvents="none" />{d.patrol.map((v, i) => { const k = `patrol:${d.id}:${i}`, pt = position(k, v); return <g key={k} onPointerDown={event => select(event, k)}><circle cx={pt.x} cy={pt.z} r={selection === k ? .5 : .32} fill={selection === k ? '#116b73' : '#c77b68'} stroke="#fff" strokeWidth=".12" />{!compact && <text x={pt.x} y={pt.z + .15} textAnchor="middle" fontSize=".45" fill="white" pointerEvents="none">{i + 1}</text>}</g>; })}</g>; })}
    {world.objects.map(o => { const key = `object:${o.id}`, p = position(key, o); return <g key={key} onPointerDown={event => select(event, key)} style={{ cursor: onSelect ? 'grab' : undefined }}><rect x={p.x - o.width / 2 + .16} y={p.z - o.depth / 2 + .24} width={o.width} height={o.depth} rx={o.kind === 'barrel' ? Math.min(o.width, o.depth) / 2 : .13} fill="#365944" opacity=".15" /><rect x={p.x - o.width / 2} y={p.z - o.depth / 2} width={o.width} height={o.depth} rx={o.kind === 'barrel' ? Math.min(o.width, o.depth) / 2 : .13} fill={colors[o.kind]} stroke={outline(key, o.id)} strokeWidth={selection === key ? .3 : sw} />{o.kind === 'gate' && <path d={`M ${p.x - o.width / 2 + .2} ${p.z} L ${p.x + o.width / 2 - .2} ${p.z}`} stroke="#e5fbec" strokeWidth=".15" strokeDasharray=".35 .2" pointerEvents="none" />}{o.kind === 'crate' && <path d={`M ${p.x - o.width / 2 + .2} ${p.z - o.depth / 2 + .2} L ${p.x + o.width / 2 - .2} ${p.z + o.depth / 2 - .2} M ${p.x + o.width / 2 - .2} ${p.z - o.depth / 2 + .2} L ${p.x - o.width / 2 + .2} ${p.z + o.depth / 2 - .2}`} stroke="#fff" strokeOpacity=".25" strokeWidth=".12" pointerEvents="none" />}</g>; })}
    {marker('beacon')}{marker('extraction')}
    {world.drones.map(d => { const key = `drone:${d.id}`, p = position(key, d); return <g key={key} onPointerDown={event => select(event, key)} style={{ cursor: onSelect ? 'grab' : undefined }}><g transform={`translate(${p.x} ${p.z}) rotate(${-d.yaw * 180 / Math.PI})`}><path d="M 0 0 L -1.8 -2.4 Q 0 -3.3 1.8 -2.4 Z" fill="#cf765d" opacity=".14" pointerEvents="none" /><circle r=".65" fill="#b96b5c" stroke={outline(key, d.id)} strokeWidth={selection === key ? .3 : sw} /><path d="M -.25 -.1 L 0 -.42 L .25 -.1" fill="none" stroke="#fff7e4" strokeWidth=".14" pointerEvents="none" /></g></g>; })}
    <g transform={`translate(${player.x} ${player.z})`} onPointerDown={event => select(event, 'spawn')} style={{ cursor: onSelect ? 'grab' : undefined }}><circle r=".78" fill="#f2c955" stroke={outline('spawn', 'spawn')} strokeWidth={selection === 'spawn' ? .3 : sw} /><path d="M -.25 .15 L 0 -.35 L .25 .15 Z" fill="#5a6942" transform={`rotate(${-world.spawn.yaw * 180 / Math.PI})`} pointerEvents="none" />{!compact && <text y="1.55" textAnchor="middle" fontSize=".85" fill="#456052" pointerEvents="none">出生</text>}</g>
    {!compact && <g pointerEvents="none" fill="#587460"><text x={half - 1.2} y={-half + 2} textAnchor="end" fontSize=".9">N ↑</text><text x={-half + 1} y={half - 1} fontSize=".75">{half * 2} × {half * 2} m · 网格 2 m</text></g>}
  </svg>;
}

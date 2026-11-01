import { useId } from 'react';
import type { WorldDefinition } from '../../../objects/worlds/WorldDefinition.ts';

/** Draw the actual world's entities and patrol points; no invented route or static screenshot. */
export function WorldPreview({ world, beaconObjective = false, label = '行动地图俯视图' }: {
  world: WorldDefinition; beaconObjective?: boolean; label?: string;
}) {
  const patternId = useId();
  const scale = 250 / (world.bounds.halfSize * 2);
  const x = (value: number) => 180 + value * scale;
  const z = (value: number) => 150 + value * scale;
  return <figure className="overflow-hidden rounded-2xl bg-[#e5ecda]">
    <svg viewBox="0 0 360 300" role="img" aria-label={label} className="block h-full w-full">
      <defs><pattern id={patternId} width="18" height="18" patternUnits="userSpaceOnUse"><path d="M 18 0 L 0 0 0 18" fill="none" stroke="#62866a" strokeWidth=".5" opacity=".18" /></pattern></defs>
      <rect width="360" height="300" fill="#e5ecda" />
      <rect x="55" y="25" width="250" height="250" rx="14" fill="#d6e2c8" stroke="#819b7c" strokeWidth="1" strokeDasharray="4 4" />
      <rect width="360" height="300" fill={`url(#${patternId})`} />
      {world.terrain.hillHeight > 0 && <g opacity=".45"><ellipse cx={x(world.terrain.hillX)} cy={z(world.terrain.hillZ)} rx={world.terrain.hillWidth * scale * 1.5} ry={world.terrain.hillWidth * scale * 1.3} fill="#bdcfae" /><ellipse cx={x(world.terrain.hillX)} cy={z(world.terrain.hillZ)} rx={world.terrain.hillWidth * scale} ry={world.terrain.hillWidth * scale * .85} fill="none" stroke="#91ad80" /><ellipse cx={x(world.terrain.hillX)} cy={z(world.terrain.hillZ)} rx={world.terrain.hillWidth * scale * .5} ry={world.terrain.hillWidth * scale * .45} fill="none" stroke="#91ad80" /></g>}
      {world.drones.map(drone => <polyline key={`path-${drone.id}`} points={drone.patrol.map(point => `${x(point.x)},${z(point.z)}`).join(' ')} fill="none" stroke="#a67566" strokeWidth="1.25" strokeDasharray="3 4" opacity=".6" />)}
      {world.objects.map(object => <g key={object.id}><rect x={x(object.x - object.width / 2)} y={z(object.z - object.depth / 2) + 1.5} width={object.width * scale} height={object.depth * scale} rx={object.kind === 'barrel' ? 3 : 1} fill="#35584c" opacity=".16" /><rect x={x(object.x - object.width / 2)} y={z(object.z - object.depth / 2)} width={object.width * scale} height={object.depth * scale} rx={object.kind === 'barrel' ? 3 : 1} fill={object.kind === 'gate' ? '#e8ad42' : object.kind === 'wall' ? '#6d8975' : '#a98250'} stroke={object.kind === 'gate' ? '#a16b20' : '#4d6c58'} strokeWidth=".7" /></g>)}
      {world.drones.map(drone => <g key={drone.id} transform={`translate(${x(drone.x)} ${z(drone.z)})`}><circle r="5.5" fill="#bb5444" stroke="#fff9e6" strokeWidth="1.5" /><path d="M -2 -1 L 0 3 L 2 -1" fill="none" stroke="#fff9e6" strokeWidth="1" transform={`rotate(${-drone.yaw * 180 / Math.PI})`} /></g>)}
      {beaconObjective && <><circle cx={x(world.beacon.x)} cy={z(world.beacon.z)} r={Math.max(7, world.beacon.radius * scale)} fill="#f3bf5650" stroke="#a67b20" strokeDasharray="2 2" /><path d={`M ${x(world.beacon.x)} ${z(world.beacon.z) - 5} l 4 5 -4 5 -4 -5 Z`} fill="#d49a22" stroke="#fff9e6" /><circle cx={x(world.extraction.x)} cy={z(world.extraction.z)} r={Math.max(8, world.extraction.radius * scale)} fill="#17665d1a" stroke="#17665d" strokeWidth="1.5" /><path d={`M ${x(world.extraction.x) - 3} ${z(world.extraction.z)} h 6 m -3 -3 3 3 -3 3`} fill="none" stroke="#17665d" strokeWidth="1.5" /></>}
      <g transform={`translate(${x(world.spawn.x)} ${z(world.spawn.z)})`}><circle r="7" fill="#fffaf0" stroke="#17665d" strokeWidth="2" /><circle r="2.5" fill="#17665d" /></g>
      <text x="22" y="27" fill="#496a54" fontSize="10" fontWeight="700" letterSpacing="2">N</text><path d="M 25 34 v 16 m -3 -12 3 -4 3 4" fill="none" stroke="#496a54" strokeWidth="1.2" />
      <text x="24" y="283" fill="#496a54" fontSize="9" letterSpacing="1.5">BLOOM VALLEY / FIELD MAP</text>
    </svg>
    <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#809b7a]/20 px-4 py-3 text-[11px] text-[#496a54]">
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-primary bg-surface" />出生点</span><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-danger" />无人机</span><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#6d8975]" />掩体</span>{beaconObjective && <><span className="flex items-center gap-1.5"><span className="size-2.5 rotate-45 bg-[#d49a22]" />信标</span><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border border-primary" />撤离点</span></>}
    </figcaption>
  </figure>;
}

/** A finite, continuous exploration valley; the safety clamp lies behind its mountain crest. */
export const WORLD_TERRAIN_HALF_SIZE = 80;
export const WORLD_SAFETY_HALF_SIZE = 78;
export const VALLEY_RADIUS = 47;
export const MOUNTAIN_RISE_WIDTH = 10;

/** Angle convention matches atan2(x, z), so zero faces world +Z. */
export function mountainBoundaryRadius(angle: number): number {
  return VALLEY_RADIUS + 4 * Math.sin(angle * 3 + 0.5) + 2 * Math.sin(angle * 5 - 0.8);
}

export function mountainCrestHeight(angle: number): number {
  return 22 + 5 * Math.sin(angle * 3 + 1.2) + 3 * Math.sin(angle * 7 - 0.4)
    + Math.sin(angle * 11 + 0.7);
}

/** Normalized distance from the beginning of the mountain wall to its crest. */
export function mountainProgress(x: number, z: number): number {
  return (Math.hypot(x, z) - mountainBoundaryRadius(Math.atan2(x, z))) / MOUNTAIN_RISE_WIDTH;
}

const trails = [
  [[-1.3, 1], [-12, 5], [-25, 16]],
  [[-1.2, -6], [19, -2], [27, 15]],
  [[-4.5, -17], [-5, -25], [0, -28]],
] as const;
const trailSegments: { x: number; z: number; dx: number; dz: number; lengthSquared: number }[] = [];
for (const [start, control, end] of trails) {
  let previous: readonly number[] = start;
  for (let i = 1; i <= 16; i++) {
    const t = i / 16, s = 1 - t;
    const next = [s * s * start[0] + 2 * s * t * control[0] + t * t * end[0],
      s * s * start[1] + 2 * s * t * control[1] + t * t * end[1]];
    const dx = next[0] - previous[0], dz = next[1] - previous[1];
    trailSegments.push({ x: previous[0], z: previous[1], dx, dz, lengthSquared: dx * dx + dz * dz });
    previous = next;
  }
}

/** Shared by soil tint and vegetation placement so the three destination trails stay clear. */
export function valleyPathDistance(x: number, z: number): number {
  const t = Math.max(0, Math.min(1, (Math.abs(z) - 12) / 12));
  const outerPath = t * t * (3 - 2 * t);
  const mainX = -1.65 + 0.9 * Math.sin(z * 0.23) + outerPath * 5 * Math.sin(z * 0.09);
  let distanceSquared = (x - mainX) ** 2;
  for (const segment of trailSegments) {
    const u = Math.max(0, Math.min(1, ((x - segment.x) * segment.dx + (z - segment.z) * segment.dz) / segment.lengthSquared));
    const dx = x - segment.x - segment.dx * u, dz = z - segment.z - segment.dz * u;
    distanceSquared = Math.min(distanceSquared, dx * dx + dz * dz);
  }
  return Math.sqrt(distanceSquared);
}

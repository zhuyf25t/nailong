/** Collision times are fractions of a swept segment, so frame rate cannot tunnel through a box. */
export type Point3 = { x: number; y: number; z: number };
export type ProjectileBox = { min: Point3; max: Point3 };
export type ProjectileTarget = { center: Point3; active: boolean };
export type ProjectileImpact = { kind: 'target'; index: number; time: number } | { kind: 'block'; time: number };

export function segmentSphereTime(from: Point3, to: Point3, center: Point3, radius: number): number | null {
  const dx = to.x - from.x; const dy = to.y - from.y; const dz = to.z - from.z;
  const ox = from.x - center.x; const oy = from.y - center.y; const oz = from.z - center.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-16) return null;
  const b = ox * dx + oy * dy + oz * dz;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  const time = (-b - Math.sqrt(discriminant)) / a;
  return time >= 0 && time <= 1 ? time : null;
}

export function segmentBoxTime(from: Point3, to: Point3, box: ProjectileBox, radius = 0): number | null {
  let entry = 0; let exit = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const start = from[axis]; const delta = to[axis] - start;
    const min = box.min[axis] - radius; const max = box.max[axis] + radius;
    if (Math.abs(delta) < 1e-12) {
      if (start < min || start > max) return null;
      continue;
    }
    const a = (min - start) / delta; const b = (max - start) / delta;
    entry = Math.max(entry, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (entry > exit) return null;
  }
  return entry;
}

/** Height-field ground is sampled at <= 0.12 world-unit intervals, then refined at first entry. */
export function segmentTerrainTime(from: Point3, to: Point3, sampleHeight: (x: number, z: number) => number, radius = 0): number | null {
  const dx = to.x - from.x; const dy = to.y - from.y; const dz = to.z - from.z;
  const clearance = (t: number) => from.y + dy * t - radius - sampleHeight(from.x + dx * t, from.z + dz * t);
  if (clearance(0) <= 0) return 0;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / 0.12));
  for (let step = 1; step <= steps; step++) {
    const time = step / steps;
    if (clearance(time) > 0) continue;
    let lower = (step - 1) / steps; let upper = time;
    for (let i = 0; i < 10; i++) {
      const mid = (lower + upper) / 2;
      if (clearance(mid) > 0) lower = mid; else upper = mid;
    }
    return upper;
  }
  return null;
}

/** Obstacles win equal-distance ties. Only the nearest active target can receive a hit. */
export function firstProjectileImpact(
  from: Point3,
  to: Point3,
  targets: readonly ProjectileTarget[],
  targetRadius: number,
  boxes: readonly ProjectileBox[],
  bulletRadius: number,
  sampleHeight?: (x: number, z: number) => number,
): ProjectileImpact | null {
  let first: ProjectileImpact | null = null;
  for (const box of boxes) {
    const time = segmentBoxTime(from, to, box, bulletRadius);
    if (time !== null && (first === null || time < first.time)) first = { kind: 'block', time };
  }
  if (sampleHeight) {
    const time = segmentTerrainTime(from, to, sampleHeight, bulletRadius);
    if (time !== null && (first === null || time < first.time)) first = { kind: 'block', time };
  }
  targets.forEach((target, index) => {
    if (!target.active) return;
    const time = segmentSphereTime(from, to, target.center, targetRadius);
    if (time !== null && (first === null || time < first.time - 1e-9)) first = { kind: 'target', index, time };
  });
  return first;
}

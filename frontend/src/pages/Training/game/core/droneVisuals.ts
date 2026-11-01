import * as THREE from 'three';
import { DEFAULT_DRONE_RULES, type DroneRules } from './defaultRules.ts';

export interface DroneVisualItem {
  id: number;
  /** World-space eye position. yaw = 0 points towards +Z. */
  position: THREE.Vector3;
  yaw: number;
  hp: number;
  maxHp: number;
  mode: 'scanning' | 'alert' | 'locked' | 'destroyed';
  range: number;
  fovDegrees?: number;
  hasLineOfSight: (point: { x: number; y: number; z: number }) => boolean;
}

const ANGULAR_STEPS = 16;
const RADIAL_STEPS = 6;
const ROW = ANGULAR_STEPS + 1;
const GROUND_OFFSET = 0.055;

/** One bounded visual slot per configured spawn; meshes are not shooting targets. */
export function createDroneVisuals(scene: THREE.Scene, sampleHeight: (x: number, z: number) => number, rules: DroneRules = DEFAULT_DRONE_RULES) {
  const root = new THREE.Group();
  root.name = 'DroneScanVisuals';
  scene.add(root);
  const scanColor = new THREE.Color('#ee463e');
  const fanMaterials = [0.85, 1, 1].map(opacity => new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity, side: THREE.DoubleSide,
    depthTest: true, depthWrite: false, toneMapped: false,
  }));
  const lineMaterials = [0.65, 0.82, 0.95].map(opacity => new THREE.LineBasicMaterial({
    color: '#ff7167', transparent: true, opacity, depthTest: true, depthWrite: false, toneMapped: false,
  }));
  const healthMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
  });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#ff4b40', toneMapped: false, depthTest: true });
  const eyeGeometry = new THREE.SphereGeometry(0.065, 10, 6);
  const indices: number[] = [];
  for (let ring = 0; ring < RADIAL_STEPS; ring++) {
    for (let angle = 0; angle < ANGULAR_STEPS; angle++) {
      const a = ring * ROW + angle;
      indices.push(a, a + ROW, a + 1, a + 1, a + ROW, a + ROW + 1);
    }
  }

  const visuals = Array.from({ length: rules.spawns.length }, (_, slot) => {
    const group = new THREE.Group();
    group.name = `DroneVisual_${slot}`;
    group.visible = false;
    root.add(group);
    const scanRoot = new THREE.Group();
    group.add(scanRoot);
    const fanGeometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array((RADIAL_STEPS + 1) * ROW * 3), 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    const colors = new THREE.BufferAttribute(new Float32Array((RADIAL_STEPS + 1) * ROW * 4), 4);
    for (let ring = 0; ring <= RADIAL_STEPS; ring++) {
      const t = ring / RADIAL_STEPS;
      const alpha = 0.06 + 0.22 * Math.sin(t * Math.PI);
      for (let angle = 0; angle <= ANGULAR_STEPS; angle++) {
        colors.setXYZW(ring * ROW + angle, scanColor.r, scanColor.g, scanColor.b, alpha);
      }
    }
    fanGeometry.setAttribute('position', positions);
    fanGeometry.setAttribute('color', colors);
    fanGeometry.setIndex(indices);
    const fan = new THREE.Mesh(fanGeometry, fanMaterials[0]);
    fan.name = 'GroundScanSector';
    fan.renderOrder = 1;
    scanRoot.add(fan);

    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new THREE.BufferAttribute(new Float32Array((ANGULAR_STEPS + RADIAL_STEPS * 2) * 2 * 3), 3);
    linePositions.setUsage(THREE.DynamicDrawUsage);
    lineGeometry.setAttribute('position', linePositions);
    const outline = new THREE.LineSegments(lineGeometry, lineMaterials[0]);
    outline.name = 'ScanSectorOutline';
    outline.renderOrder = 2;
    scanRoot.add(outline);

    // One mesh carries the backing and the configured number of health cells.
    const healthGeometry = new THREE.BufferGeometry();
    const healthPositions: number[] = [];
    const healthIndices: number[] = [];
    const cellSpan = 1.08 / rules.maxHp;
    const quads = [[0, 1.2, 0.21, 0], ...Array.from({ length: rules.maxHp }, (_, index) => [
      -0.54 + cellSpan * (index + 0.5), cellSpan * 0.88, 0.105, 0.003,
    ])];
    for (let q = 0; q < quads.length; q++) {
      const [x, width, height, z] = quads[q];
      healthPositions.push(x - width / 2, -height / 2, z, x + width / 2, -height / 2, z, x + width / 2, height / 2, z, x - width / 2, height / 2, z);
      const a = q * 4;
      healthIndices.push(a, a + 1, a + 2, a, a + 2, a + 3);
    }
    healthGeometry.setAttribute('position', new THREE.Float32BufferAttribute(healthPositions, 3));
    healthGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(quads.length * 16), 4).setUsage(THREE.DynamicDrawUsage));
    healthGeometry.setIndex(healthIndices);
    const health = new THREE.Mesh(healthGeometry, healthMaterial);
    health.name = 'DroneHealth';
    health.renderOrder = 3;
    group.add(health);
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.name = 'DroneScannerEye';
    group.add(eye);
    return { id: -1, group, scanRoot, fan, outline, health, eye, positions, linePositions, lastHealth: -1,
      scanKey: '', terrainRevision: -1 };
  });

  const probe = { x: 0, y: 0, z: 0 };
  let terrainRevision = 0;
  const cameraRotation = new THREE.Quaternion();
  const fullCell = new THREE.Color('#ff7466');
  const emptyCell = new THREE.Color('#513734');
  const healthBack = new THREE.Color('#172226');
  const heightAt = (x: number, z: number) => {
    const height = sampleHeight(x, z);
    return Number.isFinite(height) ? height : 0;
  };

  function clipDistance(item: DroneVisualItem, sine: number, cosine: number, range: number) {
    const visibleAt = (distance: number) => {
      probe.x = item.position.x + sine * distance;
      probe.z = item.position.z + cosine * distance;
      // The ground footprint indicates whether a standing player's chest is visible.
      // Match detection height, rather than testing visibility of the ground itself.
      probe.y = heightAt(probe.x, probe.z) + 1.05;
      return item.hasLineOfSight(probe);
    };
    let lower = 0;
    let upper = range;
    let blocked = false;
    // Check nearer ground too: a distant point can be visible over a low nearby box.
    for (let step = 1; step <= 5; step++) {
      const distance = range * step / 5;
      if (!visibleAt(distance)) { upper = distance; blocked = true; break; }
      lower = distance;
    }
    if (!blocked) return range;
    for (let step = 0; step < 4; step++) {
      const middle = (lower + upper) / 2;
      if (visibleAt(middle)) lower = middle; else upper = middle;
    }
    return Math.max(0, lower - 0.035);
  }

  function rebuildScan(visual: typeof visuals[number], item: DroneVisualItem, yaw: number, range: number, fov: number) {
    for (let angle = 0; angle <= ANGULAR_STEPS; angle++) {
      const localAngle = -fov / 2 + fov * angle / ANGULAR_STEPS;
      const worldAngle = yaw + localAngle;
      const worldSin = Math.sin(worldAngle);
      const worldCos = Math.cos(worldAngle);
      const localSin = Math.sin(localAngle);
      const localCos = Math.cos(localAngle);
      // Sample from the current moving eye each frame; a spawn-origin cache
      // would draw stale shadows behind crates after a drone starts chasing.
      const distance = clipDistance(item, worldSin, worldCos, range);
      for (let ring = 0; ring <= RADIAL_STEPS; ring++) {
        const radius = distance * ring / RADIAL_STEPS;
        const y = heightAt(item.position.x + worldSin * radius, item.position.z + worldCos * radius);
        visual.positions.setXYZ(ring * ROW + angle, localSin * radius, y + GROUND_OFFSET, localCos * radius);
      }
    }
    let index = 0;
    const writeLine = (a: number, b: number) => {
      visual.linePositions.setXYZ(index++, visual.positions.getX(a), visual.positions.getY(a) + 0.025, visual.positions.getZ(a));
      visual.linePositions.setXYZ(index++, visual.positions.getX(b), visual.positions.getY(b) + 0.025, visual.positions.getZ(b));
    };
    for (let angle = 0; angle < ANGULAR_STEPS; angle++) writeLine(RADIAL_STEPS * ROW + angle, RADIAL_STEPS * ROW + angle + 1);
    for (let ring = 0; ring < RADIAL_STEPS; ring++) {
      writeLine(ring * ROW, (ring + 1) * ROW);
      writeLine(ring * ROW + ANGULAR_STEPS, (ring + 1) * ROW + ANGULAR_STEPS);
    }
    visual.positions.needsUpdate = true;
    visual.linePositions.needsUpdate = true;
    visual.fan.geometry.computeBoundingSphere();
    visual.outline.geometry.computeBoundingSphere();
  }

  function update(items: readonly DroneVisualItem[], camera: THREE.Camera, _dt: number) {
    camera.getWorldQuaternion(cameraRotation);
    for (let i = 0; i < visuals.length; i++) {
      const visual = visuals[i];
      const item = items[i];
      if (!item || item.mode === 'destroyed' || item.hp <= 0 || !Number.isFinite(item.position.x) || !Number.isFinite(item.position.y) || !Number.isFinite(item.position.z)) {
        visual.group.visible = false;
        visual.id = -1;
        continue;
      }
      const isNew = visual.id !== item.id;
      if (isNew) { visual.id = item.id; visual.lastHealth = -1; visual.scanKey = ''; }
      visual.group.visible = true;
      const yaw = Number.isFinite(item.yaw) ? item.yaw : 0;
      const range = Number.isFinite(item.range) ? Math.max(0, item.range) : 0;
      const fov = (item.fovDegrees ?? rules.scanFovDegrees) * Math.PI / 180;
      const contrast = item.mode === 'locked' ? 2 : item.mode === 'alert' ? 1 : 0;
      visual.fan.material = fanMaterials[contrast];
      visual.outline.material = lineMaterials[contrast];
      visual.scanRoot.visible = range > 0;
      visual.scanRoot.position.set(item.position.x, 0, item.position.z);
      visual.scanRoot.rotation.y = yaw;
      if (range > 0) {
        // Only reuse an identical pose. Moving or rotating invalidates this key;
        // paused frames therefore cost no ray casts, without stale spawn shadows.
        const key = `${item.position.x},${item.position.y},${item.position.z},${yaw},${range},${fov}`;
        if (key !== visual.scanKey || visual.terrainRevision !== terrainRevision) {
          rebuildScan(visual, item, yaw, range, fov);
          visual.scanKey = key; visual.terrainRevision = terrainRevision;
        }
      }

      visual.health.position.copy(item.position);
      visual.health.position.y += 1.3;
      visual.health.quaternion.copy(cameraRotation);
      const health = item.maxHp > 0 && Number.isFinite(item.hp) ? THREE.MathUtils.clamp(item.hp / item.maxHp, 0, 1) : 0;
      if (health !== visual.lastHealth) {
        visual.lastHealth = health;
        const colors = visual.health.geometry.getAttribute('color') as THREE.BufferAttribute;
        for (let quad = 0; quad <= rules.maxHp; quad++) {
          const filled = quad > 0 && health * rules.maxHp > quad - 1 + 1e-5;
          const color = quad === 0 ? healthBack : filled ? fullCell : emptyCell;
          for (let vertex = 0; vertex < 4; vertex++) colors.setXYZW(quad * 4 + vertex, color.r, color.g, color.b, quad === 0 ? 0.88 : 1);
        }
        colors.needsUpdate = true;
      }
      visual.eye.position.copy(item.position);
      visual.eye.position.x += Math.sin(yaw) * 0.72;
      visual.eye.position.z += Math.cos(yaw) * 0.72;
      visual.eye.scale.setScalar(contrast === 2 ? 1.35 : 1);
    }
  }

  function dispose() {
    scene.remove(root);
    for (const visual of visuals) {
      visual.fan.geometry.dispose();
      visual.outline.geometry.dispose();
      visual.health.geometry.dispose();
    }
    eyeGeometry.dispose();
    eyeMaterial.dispose();
    healthMaterial.dispose();
    for (const material of fanMaterials) material.dispose();
    for (const material of lineMaterials) material.dispose();
  }
  function invalidateTerrain() { terrainRevision++; }
  return { update, invalidateTerrain, dispose };
}

import type { MissionObjective } from '../../../../objects/training/MissionObjective';
import type { WorldDefinition } from '../../../../objects/worlds/WorldDefinition';
import type { WorldMarker } from '../../../../objects/worlds/WorldMarker';
import type { Point3 } from './shootingMath';

/** Objectives use the same frozen markers and terrain as the rendered scene. */
export function createMissionProgress(objective: MissionObjective, world?: WorldDefinition) {
  const state = { beaconActivated: false, extracted: false };
  const isBeaconMission = objective.kind === 'activate_extract';
  function near(position: Point3, marker: WorldMarker, sampleHeight: (x: number, z: number) => number) {
    return Math.hypot(position.x - marker.x, position.z - marker.z) <= marker.radius
      && Math.abs(position.y - sampleHeight(marker.x, marker.z)) < 2;
  }
  return {
    state, isBeaconMission,
    canActivate(position: Point3, sampleHeight: (x: number, z: number) => number) {
      return isBeaconMission && !!world && !state.beaconActivated && near(position, world.beacon, sampleHeight);
    },
    activate(position: Point3, sampleHeight: (x: number, z: number) => number, visible: (from: Point3, to: Point3) => boolean = () => true) {
      if (!isBeaconMission || !world || state.beaconActivated || !near(position, world.beacon, sampleHeight)) return false;
      if (!visible({ x: position.x, y: position.y + 1.05, z: position.z }, { x: world.beacon.x, y: sampleHeight(world.beacon.x, world.beacon.z) + 1.05, z: world.beacon.z })) return false;
      state.beaconActivated = true; return true;
    },
    extract(position: Point3, sampleHeight: (x: number, z: number) => number) {
      if (!isBeaconMission || !world || !state.beaconActivated || state.extracted || !near(position, world.extraction, sampleHeight)) return false;
      state.extracted = true; return true;
    },
    reset() { state.beaconActivated = false; state.extracted = false; },
  };
}

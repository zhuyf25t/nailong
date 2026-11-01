import * as THREE from 'three';
import type { TacticalEffect } from './tacticalTools.ts';

/** One lightweight slot per tool kind. Animation comes entirely from recorded
 * remaining time, so replay seeking and pausing cannot advance a hidden clock.
 * These meshes are display-only and never enter collision or projectile lists. */
export function createToolVisuals(scene: THREE.Scene) {
  const root = new THREE.Group(); root.name = 'TacticalToolVisuals'; scene.add(root);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const geometry = <T extends THREE.BufferGeometry>(value: T) => { geometries.add(value); return value; };
  const material = (color: string, opacity = 1) => {
    const value = new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity>=1,
      side:THREE.DoubleSide,toneMapped:false});
    materials.add(value); return value;
  };
  const ringGeometry = geometry(new THREE.RingGeometry(.985,1,48));
  const ring = (mat:THREE.MeshBasicMaterial, name:string) => {
    const mesh = new THREE.Mesh(ringGeometry,mat); mesh.rotation.x=-Math.PI/2; mesh.name=name; return mesh;
  };
  const curtain = new THREE.Group(); curtain.name='ToolCurtain'; root.add(curtain);
  const curtainMaterial=material('#789ca7',.12), curtainEdgeMaterial=material('#a5e6f2',.28);
  const curtainShell=new THREE.Mesh(geometry(new THREE.CylinderGeometry(1,1,1,32,1,true)),curtainMaterial);
  curtainShell.name='CurtainSightVolume'; curtain.add(curtainShell);
  const curtainRings=[0,.5,1].map((_,index)=>{const mesh=ring(curtainEdgeMaterial,`CurtainBoundary${index}`);curtain.add(mesh);return mesh;});

  const decoy=new THREE.Group(); decoy.name='ToolDecoy'; root.add(decoy);
  const base=new THREE.Mesh(geometry(new THREE.CylinderGeometry(.28,.4,.17,12)),material('#274e5a'));
  base.position.y=.1; base.name='DecoyProjector'; decoy.add(base);
  const diamondMaterial=material('#8de8ff',.9);
  const diamond=new THREE.Mesh(geometry(new THREE.OctahedronGeometry(.29)),diamondMaterial);
  diamond.name='DecoySignal'; decoy.add(diamond);
  const decoyRangeMaterial=material('#8de8ff',.12);
  const decoyRange=ring(decoyRangeMaterial,'DecoyAttractionRange'); decoyRange.position.y=.025; decoy.add(decoyRange);

  const pulse=new THREE.Group(); pulse.name='ToolPulse'; root.add(pulse);
  const pulseMaterial=material('#b1f4ff',.85), pulseLimitMaterial=material('#87d2e0',.12);
  const pulseWave=ring(pulseMaterial,'PulseWave'), pulseLimit=ring(pulseLimitMaterial,'PulseMaximumRange');
  pulseWave.position.y=.14; pulseLimit.position.y=.035; pulse.add(pulseWave,pulseLimit);
  let disposed=false;
  curtain.visible=false; decoy.visible=false; pulse.visible=false;

  function update(active: readonly TacticalEffect[], _dt = 0) {
    if(disposed) return;
    curtain.visible=false; decoy.visible=false; pulse.visible=false;
    for(const effect of active) {
      if(effect.remaining<=0 || ![effect.position.x,effect.position.y,effect.position.z,effect.radius,effect.height,effect.duration,effect.remaining].every(Number.isFinite)) continue;
      const elapsed=Math.max(0,effect.duration-effect.remaining);
      const exitFade=Math.min(1,effect.remaining/.25);
      const radius=Math.max(0,effect.radius);
      const group=effect.kind==='curtain'?curtain:effect.kind==='decoy'?decoy:pulse;
      group.visible=true; group.position.set(effect.position.x,effect.position.y,effect.position.z);
      group.userData.toolId=effect.id;
      if(effect.kind==='curtain') {
        const fade=Math.min(1,.2+elapsed/.12)*exitFade;
        curtainMaterial.opacity=.12*fade; curtainEdgeMaterial.opacity=.28*fade;
        curtainShell.scale.set(radius,Math.max(0,effect.height),radius); curtainShell.position.y=effect.height/2;
        curtainRings.forEach((mesh,index)=>{mesh.scale.setScalar(radius);mesh.position.y=effect.height*index/2+.01;});
      } else if(effect.kind==='decoy') {
        diamond.position.y=.95+Math.sin(elapsed*3)*.1; diamond.rotation.set(0,elapsed*1.6,Math.PI/6);
        diamondMaterial.opacity=.9*exitFade; decoyRangeMaterial.opacity=(.08+.04*Math.sin(elapsed*4)**2)*exitFade;
        decoyRange.scale.setScalar(radius);
      } else {
        const progress=effect.duration>0?THREE.MathUtils.clamp(elapsed/effect.duration,0,1):1;
        pulseWave.scale.setScalar(radius*Math.sqrt(Math.max(.002,progress)));
        pulseLimit.scale.setScalar(radius); pulseMaterial.opacity=.85*(1-progress); pulseLimitMaterial.opacity=.12*(1-progress);
      }
    }
  }
  return { update, dispose() { if(disposed)return; disposed=true; scene.remove(root); geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose()); } };
}

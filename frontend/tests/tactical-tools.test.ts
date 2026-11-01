import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTacticalTools, curtainBlocksSegment, PULSE_STUN_SECONDS } from '../src/pages/Training/game/core/tacticalTools.ts';
import { createDroneBrain, updateDroneBrain, resetDroneBrain, hitDrone } from '../src/pages/Training/game/core/droneBrain.ts';
import { createDroneMotion, advanceDroneMotion, pushDroneAway } from '../src/pages/Training/game/core/droneMotion.ts';
import { createDroneEncounter } from '../src/pages/Training/game/core/droneEncounter.ts';
import { createToolVisuals } from '../src/pages/Training/game/core/toolVisuals.ts';
import { DEFAULT_DRONE_RULES } from '../src/pages/Training/game/core/defaultRules.ts';
import type { Target } from '../src/pages/Training/game/core/scene.ts';
import type { Obstacle } from '../src/pages/Training/game/core/movement.ts';
import type { WorldDefinition } from '../src/objects/worlds/WorldDefinition.ts';
import type { RunEventInput } from '../src/objects/records/RunEvent.ts';

const flat = () => 0;
const point = (x = 0, y = 1, z = 0) => ({ x, y, z });
const farPlayer = point(100, 1, 100);
const stationary = { ...DEFAULT_DRONE_RULES, spawns: [{ x:0,z:0,yaw:0 }], patrolSpeed:0,chaseSpeed:0,scanSpeed:0,spawnGraceSeconds:0 };
function encounter(obstacles: Obstacle[] = [], options: Parameters<typeof createDroneEncounter>[4] = {}, rules = stationary) {
  const scene = new THREE.Scene();
  const target: Target = { root:new THREE.Group(), center:new THREE.Vector3(), alive:true,cooldown:0,pulse:0 };
  scene.add(target.root);
  const value = createDroneEncounter(scene, [target], flat, rules, { ...options, obstacles });
  const camera = new THREE.PerspectiveCamera();
  value.setEnabled(true);
  return { value,target,camera,step(dt: number, player = new THREE.Vector3(0,0,5), active = true) { return value.update(dt,player,camera,active); } };
}

test('one tool charge survives expiry, snapshots cannot mutate live state, reset restores charge', () => {
  const state = createTacticalTools(flat, []);
  assert.equal(state.use('none', point(),0),null);
  assert.ok(state.use('curtain', point(),0));
  assert.equal(state.use('pulse', point(),0),null);
  const snapshot = state.snapshot(); snapshot.active[0].position.x = 999;
  assert.equal(state.snapshot().active[0].position.x,0);
  state.advance(4); assert.equal(state.snapshot().active.length,0);
  assert.equal(state.use('decoy',point(),0),null);
  state.reset(); assert.ok(state.use('pulse',point(),0));
});

test('curtain is a finite height sight cylinder, including observers inside, with no body or projectile shape', () => {
  const state = createTacticalTools(flat, []);
  const effect = state.use('curtain', point(0,0,5),0)!;
  assert.equal(curtainBlocksSegment(effect,point(),point(0,1,10)),true);
  assert.equal(state.blocksSight(point(0,1,5),point(0,1,10)),true);
  assert.equal(state.blocksSight(point(0,5,0),point(0,5,10)),false);
  assert.equal(state.blocksSight(point(4,1,0),point(4,1,10)),false);
  state.advance(4); assert.equal(state.blocksSight(point(),point(0,1,10)),false);
});

test('curtain keeps last observed position until lost-sight expires; hidden movement is not tracked', () => {
  const events: RunEventInput[] = [], effects: string[] = [];
  const game = encounter([], { onEvent:e=>events.push(e), onToolEffect:kind=>effects.push(kind) });
  try {
    game.step(.01); assert.equal(game.value.brains[0].state,'locked');
    assert.equal(game.value.useTool('curtain',point(0,0,5),0),true);
    game.step(.2,new THREE.Vector3(1,0,5));
    assert.equal(game.value.brains[0].state,'locked');
    assert.equal(game.value.brains[0].lastSeen!.x,0);
    game.step(.81,new THREE.Vector3(1,0,5));
    assert.equal(game.value.brains[0].state,'alert');
    assert.deepEqual(effects,['curtain']);
    assert.equal(events.filter(e=>e.detail==='locked:saw-player').length,1);
    assert.equal(events.filter(e=>e.detail==='alert:lost-sight').length,1);
  } finally { game.value.dispose(); }
});

test('a curtain cannot make physical drone contact harmless', () => {
  const game = encounter();
  try {
    game.step(.01); game.value.useTool('curtain',point(0,0,5),0);
    game.target.center.set(0,1.2,4.1);
    assert.equal(game.step(.01).contact,0);
  } finally { game.value.dispose(); }
});

test('decoy cannot replace a visible player lock or skip its lost-sight grace', () => {
  const brain = createDroneBrain({ seed:5 });
  const observation = { position:point(),player:point(0,1,5),decoy:point(5,1,0) };
  updateDroneBrain(brain,.01,observation);
  assert.equal(brain.state,'locked'); assert.equal(brain.investigate,null);
  hitDrone(brain); assert.equal(brain.state,'locked');
  updateDroneBrain(brain,.5,{...observation,hasLineOfSight:()=>false});
  assert.equal(brain.state,'locked'); assert.equal(brain.investigate,null);
  assert.deepEqual(brain.lastSeen,observation.player);
  updateDroneBrain(brain,.8,{...observation,hasLineOfSight:()=>false});
  assert.equal(brain.state,'alert'); assert.deepEqual(brain.investigate,observation.decoy);
  const moved = advanceDroneMotion(createDroneMotion(point(),0),point(),brain,.1,[],flat);
  assert.ok(moved.x>0); assert.equal(moved.z,0);
  updateDroneBrain(brain,.01,{...observation,player:point(5,1,0)});
  assert.equal(brain.state,'locked'); assert.equal(brain.investigate,null);
});

test('decoy placement is clipped by walls and range/physical visibility constrain attraction', () => {
  const wall = { x:0,z:1,halfX:2,halfZ:.2,height:4 };
  const state = createTacticalTools(flat,[wall]);
  const effect = state.use('decoy',point(),0)!;
  assert.ok(effect.position.z < .8);
  assert.equal(state.decoyAt(point(),()=>false),null);
  assert.equal(state.decoyAt(point(20),()=>true),null);
  assert.ok(state.decoyAt(point(),()=>true));
});

test('academy tool evidence requires a real decoy investigation and reports it only once per drone', () => {
  const wall = {x:0,z:-2,halfX:.3,halfZ:.2,height:4};
  const effects:string[]=[];
  const game=encounter([wall],{onToolEffect:(kind,id)=>effects.push(`${kind}:${id}`)},
    {...stationary,spawns:[{x:0,z:0,yaw:Math.PI}]});
  try {
    const player=new THREE.Vector3(0,0,-4);
    game.step(.01,player); assert.equal(game.value.brains[0].state,'scanning');
    game.value.useTool('decoy',player,Math.PI/2);
    assert.deepEqual(effects,[]);
    game.step(.05,player); game.step(.05,player);
    assert.deepEqual(effects,['decoy:drone-0']);
    assert.ok(game.value.brains[0].investigate);
  } finally { game.value.dispose(); }
});

test('paused or finished encounters cannot spend a tool charge', () => {
  const game=encounter();
  try {
    game.step(.01,new THREE.Vector3(0,0,5),false);
    assert.equal(game.value.useTool('pulse',point(0,0,5),0),false);
    assert.equal(game.value.toolSnapshot().used,false);
    game.step(.01);
    game.target.center.set(0,1.2,4.1); game.step(.01);
    assert.equal(game.value.useTool('curtain',point(0,0,5),0),false);
    assert.equal(game.value.toolSnapshot().used,false);
  } finally { game.value.dispose(); }
});

test('pulse push is swept against walls, terrain cliffs and world bounds', () => {
  const wall = { x:0,z:3,halfX:3,halfZ:.3,height:4 };
  const pushed = pushDroneAway(point(0,1.2,2),point(),2.4,[wall],flat);
  assert.ok(pushed.z <= 3-.3-.65+1e-8); assert.ok(pushed.z>=2);
  const cliff = (_x:number,z:number)=>z>=2.2?20:0;
  assert.ok(pushDroneAway(point(0,1.2,2),point(),2.4,[],cliff).z<2.2);
  assert.ok(pushDroneAway(point(0,1.2,8),point(),2.4,[],flat,.65,10).z<=9.35);
});

test('pulse affects in-range visible drones once, pauses timers, then restores normal pursuit', () => {
  const effects:string[]=[];
  const game = encounter([],{onToolEffect:kind=>effects.push(kind)},{...stationary,chaseSpeed:7.2});
  try {
    const player=new THREE.Vector3(0,0,4);
    game.step(.01,player); assert.equal(game.value.brains[0].state,'locked');
    assert.equal(game.value.useTool('pulse',player,Math.PI),true);
    const afterPush=game.target.center.z;
    assert.deepEqual(effects,['pulse']); assert.equal(game.value.snapshot()[0].stunned,true);
    game.step(10,player,false); assert.equal(game.target.center.z,afterPush);
    assert.equal(game.value.snapshot()[0].stunned,true);
    game.step(PULSE_STUN_SECONDS,player); assert.equal(game.target.center.z,afterPush);
    game.step(.1,player); assert.ok(game.target.center.z>afterPush);
    assert.equal(game.value.snapshot()[0].stunned,false); assert.equal(game.value.brains[0].state,'locked');
    assert.equal(game.value.useTool('pulse',player,0),false);
  } finally { game.value.dispose(); }
});

test('closed walls block pulse; removing the same gate array opens perception immediately', () => {
  const obstacles:Obstacle[]=[{x:0,z:2,halfX:4,halfZ:.2,height:4}];
  const events:RunEventInput[]=[];
  const game=encounter(obstacles,{onEvent:e=>events.push(e)});
  try {
    game.step(.01); assert.equal(game.value.brains[0].state,'scanning');
    game.value.useTool('pulse',point(0,0,4),0); assert.equal(game.value.snapshot()[0].stunned,false);
    obstacles.splice(0,1); game.step(.01);
    assert.equal(game.value.brains[0].state,'locked');
    assert.equal(events.filter(e=>e.detail==='locked:saw-player').length,1);
  } finally { game.value.dispose(); }
});

test('seeded scan streams reproduce after reset and do not depend on other drones', () => {
  const first = createDroneBrain({seed:440,stream:'east'}), second = createDroneBrain({seed:440,stream:'east'});
  const observation={position:point(),player:farPlayer};
  updateDroneBrain(first,10,observation); updateDroneBrain(second,10,observation);
  assert.equal(first.yaw,second.yaw);
  const expected={yaw:first.yaw,directionRemaining:first.directionRemaining,turnDirection:first.turnDirection};
  resetDroneBrain(first); updateDroneBrain(first,10,observation);
  assert.deepEqual({yaw:first.yaw,directionRemaining:first.directionRemaining,turnDirection:first.turnDirection},expected);
  const other=createDroneBrain({seed:440,stream:'west'}); updateDroneBrain(other,10,observation);
  assert.notEqual(first.yaw,other.yaw);
});

test('world patrol paths and stable IDs drive spawn, motion, and destruction events', () => {
  const world:WorldDefinition={schemaVersion:1,title:'Patrol',terrain:{hillHeight:0,hillWidth:5,hillX:0,hillZ:0,ripple:0},bounds:{halfSize:20},
    spawn:{x:0,z:10,yaw:0},objects:[],drones:[{id:'north-sentinel',x:3,z:4,yaw:1,patrol:[{x:10,z:4}]}],
    beacon:{id:'b',x:0,z:0,radius:1},extraction:{id:'e',x:0,z:10,radius:2}};
  const events:RunEventInput[]=[];
  const game=encounter([],{world,seed:42,onEvent:e=>events.push(e)},{...stationary,patrolSpeed:1.1});
  try {
    assert.equal(game.value.snapshot()[0].stableId,'north-sentinel');
    assert.equal(game.target.center.x,3); assert.equal(game.target.center.z,4);
    game.step(.1,new THREE.Vector3(30,0,30)); assert.ok(game.target.center.x>3); assert.equal(game.target.center.z,4);
    game.value.hit(game.target); game.value.hit(game.target); game.value.hit(game.target); game.value.hit(game.target);
    assert.equal(events.filter(e=>e.kind==='destroyed').length,1);
    assert.equal(events.find(e=>e.kind==='destroyed')!.targetId,'north-sentinel');
    assert.equal(events.filter(e=>e.detail==='alert:hit-unaware').length,1);
  } finally { game.value.dispose(); }
});

test('tool visuals match actual dimensions, seek from snapshots, and release their GPU resources', () => {
  const scene=new THREE.Scene(), visuals=createToolVisuals(scene), tools=createTacticalTools(flat,[]);
  const effect=tools.use('curtain',point(2,0,3),0)!;
  visuals.update([effect]);
  const root=scene.getObjectByName('TacticalToolVisuals')!;
  const shell=scene.getObjectByName('CurtainSightVolume') as THREE.Mesh;
  assert.equal(shell.scale.x,effect.radius);assert.equal(shell.scale.y,effect.height);
  assert.equal(shell.parent!.position.x,2);assert.equal(shell.parent!.position.z,3);
  const decoy={...effect,kind:'decoy' as const,radius:8,duration:5,remaining:3,height:0};
  visuals.update([decoy]);
  const diamond=scene.getObjectByName('DecoySignal')!;
  const expectedRotation=diamond.rotation.y,expectedY=diamond.position.y;
  visuals.update([{...decoy,remaining:1}],10);
  assert.notEqual(diamond.rotation.y,expectedRotation);
  visuals.update([decoy],0);assert.equal(diamond.rotation.y,expectedRotation);assert.equal(diamond.position.y,expectedY);
  visuals.update([decoy],10);assert.equal(diamond.rotation.y,expectedRotation);
  const geometries=new Set<THREE.BufferGeometry>(), materials=new Set<THREE.Material>();
  root.traverse(item=>{if(item instanceof THREE.Mesh){geometries.add(item.geometry); for(const mat of Array.isArray(item.material)?item.material:[item.material])materials.add(mat);}});
  let disposedGeometry=0,disposedMaterial=0;
  geometries.forEach(value=>value.addEventListener('dispose',()=>disposedGeometry++));
  materials.forEach(value=>value.addEventListener('dispose',()=>disposedMaterial++));
  visuals.dispose();visuals.dispose();
  assert.equal(scene.getObjectByName('TacticalToolVisuals'),undefined);
  assert.equal(disposedGeometry,geometries.size);assert.equal(disposedMaterial,materials.size);
});

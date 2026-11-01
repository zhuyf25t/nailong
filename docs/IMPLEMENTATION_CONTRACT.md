# 花谷扩展实施契约

本文件协调 README 的 A–C 阶段实现。字段改动需通知相关实现者；旧 API 请求及旧成绩保持兼容。公开 JSON 用 camelCase，有限状态用下列字符串；一个领域类型一个文件。

## 世界与任务

- `WorldDefinition`: `{ schemaVersion: 1, title: string, terrain: TerrainConfig, bounds: { halfSize: number }, spawn: { x, z, yaw }, objects: WorldObject[], drones: WorldDrone[], beacon: WorldMarker, extraction: WorldMarker }`。
- `WorldObject`: `{ id: string, kind: 'crate'|'barrel'|'wall'|'gate', x, z, width, depth, height }`。轴对齐实体，位置取地形高度；门打开后移除同一实体的移动、子弹及视线阻挡。
- `WorldDrone`: `{ id: string, x, z, yaw, patrol: {x,z}[] }`。稳定 ID 用于事件与回放。
- `WorldMarker`: `{ id: string, x, z, radius: number }`。
- 世界静态实体、无人机、marker 的 ID 全局唯一；保留 `player` 和 `projectile-` / `tool-` 前缀，不能被地图实体占用，以免与玩家及运行时弹丸/工具实例的录像引用冲突。
- `MissionId`: 有界小写 slug，内置 `clear-drones` 和 `forest-beacon`。
- `MissionObjective`: `{ kind: 'clear_drones' } | { kind: 'activate_extract', beaconId: string, extractionId: string }`。
- `ToolKind`: `'none'|'curtain'|'decoy'|'pulse'`；`Loadout`: `{ tool: ToolKind }`。每局最多一次使用，Q 键及触屏按钮；信标靠近按 E 或触屏交互，进入撤离范围完成。
- `MissionDefinition`: `{ id, version: string, title, description, objective, mapVersionId: UUID, allowedTools: ToolKind[], configVersion: string }`。
- `RunSelection`: `{ missionId, mapVersionId?: UUID, loadout }`；自定义地图版本允许本人读取，任务目标映射到该地图的 marker IDs。
- `RunSetup`: `{ mission: MissionDefinition, world: WorldDefinition, mapVersionId: UUID, loadout: Loadout, seed: number, assetVersion: 'garden-v1' }`。
- `TrainingRun` 新增可选/nullable `setup`；`StartTrainingRun` 新增可选 `selection`。无 selection 继续旧四机行为；有 selection 时由服务器解析并冻结 setup，terrain 需与 world.terrain 一致，幂等比较必须包含 selection。
- `ResultSubmission` 和 `TrainingResult` 新增可选/nullable `objectiveProgress: { beaconActivated: boolean, extracted: boolean }`。清场仍校验击毁数；撤离胜利必须 activated+extracted，失败不能 extracted。新 TrainingResult 可含 `setup` 便于报告与相同配置重试。

内置地图由前端契约实现者生成共享 JSON 到 `shared/worlds/`，后端加载同一份资源（可复制到 resources 并检查一致），前端从共享 JSON 解码。至少两模板；主模板真实掩体隔开三个区域、两侧入口和可开启捷径门。

## 世界 API

接口名沿用 XAPIMessage/XAPI 的自动命名规则。

- ListMissions `{}` → `{ missions: MissionDefinition[] }`；GetMission `{ missionId }` → MissionDefinition。公开可读。
- MapId / MapVersionId 是不同 UUID 品牌。
- `MapDraft`: `{ mapId, title, revision: number, world: WorldDefinition, updatedAt: Instant }`。
- `MapVersion`: `{ id: MapVersionId, mapId, version: number, title, world, createdAt, builtIn: boolean }`。
- `MapSummary`: `{ mapId, title, revision, latestVersionId: MapVersionId|null, updatedAt, builtIn: boolean }`。
- ListMyMaps `{ offset:0, limit:30 }` → `{ maps:MapSummary[], total:number, templates:MapVersion[] }`。
- GetMapDraft `{ mapId }` → MapDraft；GetMapVersion `{ mapVersionId }` → MapVersion。
- SaveMapDraft `{ mapId, expectedRevision, title, world }` → MapDraft。草稿通过 CloneMap 创建；expectedRevision 冲突返回 409。
- CloneMap `{ mapVersionId }` → MapDraft。
- CreateMapVersion `{ mapId, expectedRevision }` → MapVersion。重复冻结相同 revision 返回同版本。
- `MapValidationIssue`: `{ code, message, objectId: string|null }`；共享前端验证与后端独立验证包括预算、边界、出生/物体重叠、目标和粗略可达性。
- 可达性分两阶段：出生点到信标按门关闭检查；激活信标后，从信标到撤离点按门打开检查。不能以可开启的门为由忽略抵达信标之前的封路。
- SaveMapDraft 单接口请求上限 64 KiB；其余世界接口维持 16 KiB，回放和摘要按下文独立预算。

## 过程记录

记录领域由 replay 实现者和 records 后端实现者协商并追加精确字段，随后契约实现者创建 TypeScript API/decoder。最低接口：SaveRunEvents `{runId,summary}`；GetRunEvents `{runId}`；SaveRunReplay `{runId,replay}`；GetRunReplay `{runId}`。全部本人归属校验，成绩先保存，事件与回放独立补传。旧记录返回 missing_legacy，不能伪造录像。

回放至少记录玩家、无人机、弹丸、工具、门/信标、镜头的纯数据状态，帧时间与 throughEventSeq、准确事件 seq、完整/片段覆盖、地图规则素材版本、内容哈希。播放器禁止调用 AI 和保存成绩。

### 过程记录精确 v1 契约（replay / records 已确认）

- `RunEventKind`: `shot | hit | drone-state | destroyed | tool | beacon | gate | extract | contact | round-end`。
- `RunEvent`: `{seq:integer 0..10000000,tMs:integer>=0,kind:RunEventKind,actorId:string|null,targetId:string|null,position:Point3|null,value:number|null,detail:string|null}`。ID 长度1–80，detail最多100字符；坐标有限且绝对值<=1000，value绝对值<=1000000。seq严格递增，tMs非递减。采集输入允许省略nullable字段，存储时全部补null。
- 引用语义：`player` 为角色；drone-state 的 actorId、destroyed 的 targetId、hit 的 targetId、contact 的 actorId 为 world.drones 稳定ID；gate/beacon/extract 的 targetId 为世界对应实体/marker；shot.targetId 和 hit.actorId 是弹丸实例ID；tool.targetId 是工具实例ID。drone-state.detail 为 `locked:saw-player | alert:hit-unaware | alert:lost-sight | scanning:search-ended`；round-end.detail=`victory|defeat`。关键事件 position 是发生时真实位置，不从插值推断。
- `RunEventSummary`: `{formatVersion:1,runDurationMs:integer,resultAtMs:integer,truncated:boolean,events:RunEvent[]}`。最多10000事件，完整summary从seq0开始；truncated允许序号不从0开始但不能乱序。resultAtMs<=runDurationMs<=86401200。round-end与已保存成绩一致，终局视觉尾段不计分。
- `ReplayPlayerState`: `{position:Point3,yaw:number,animation:'idle'|'walk'|'jump'|'aim',animationTime:number,aimWeight:number,alive:boolean}`。
- `ReplayDroneState`: `{id:string,position:Point3,yaw:number,hp:integer,state:'scanning'|'alert'|'locked'|'destroyed',flight:'taking-off'|'cruising'|'diving',stunned?:boolean}`。stunned缺省false，真实脉冲晕眩时为true并隐藏扫描；yaw为累计角度，不强制[-pi,pi]；绝对值<=1000000。
- `ReplayProjectileState`: `{id:string,position:Point3,direction:Point3}`；`ReplayToolState`: `{id:string,kind:'curtain'|'decoy'|'pulse',position:Point3,radius:number,remainingMs:integer,active:boolean}`。
- `ReplayCameraState`: `{position:Point3,target:Point3,fov:number}`；`ReplayWorldState`: `{openGateIds:string[],beaconActivated:boolean,extracted:boolean}`。
- `ReplayFrame`: `{tMs:integer,scoreElapsedMs:integer,throughEventSeq:integer>=-1,player:ReplayPlayerState,drones:ReplayDroneState[],projectiles:ReplayProjectileState[],tools:ReplayToolState[],world:ReplayWorldState,camera:ReplayCameraState}`。每帧最多32无人机、64弹丸、16工具；无重复实体ID，门引用world中gate。tMs严格递增，scoreElapsedMs非递减，throughEventSeq非递减，不能包含未来事件。throughEventSeq可以引用裁剪前的事件，但<=全局最后事件seq。
- `ReplayCoverage`: `{kind:'complete'|'ending-clip',reason:null|'byte-limit'|'duration-limit'|'frame-limit',fromMs:integer,toMs:integer,runDurationMs:integer,resultAtMs:integer}`。complete必须fromMs=0且reason=null；clip必须reason非null，真实保留原始时间；fromMs<=resultAtMs<=toMs=runDurationMs。首尾frame.tMs必须精确等于fromMs/toMs。
- `ReplayManifest`: `{formatVersion:1,runId:UUID|null,config:TrainingConfig,world:WorldDefinition,mapVersionId:UUID|null,missionId:string,assetVersion:'garden-v1',sampleHz:10,coverage:ReplayCoverage}`。本机练习允许runId=null，云端上传必须与请求runId一致；世界和规则完整冻结。不认识的asset/format版本不得假装按新版播放。
- `ReplayPayload`: `{manifest:ReplayManifest,frames:ReplayFrame[],events:RunEvent[]}`。最多12000frames/10000events；events只保留覆盖区间内事件，完整初始frame独立可恢复。每局活动时间与尾段最大86401200ms。
- `ReplayEnvelope`: `{contentHash:string,payloadJson:string}`；contentHash是**payloadJson原文UTF-8字节的SHA-256小写hex**，不对Scala/JS对象进行跨端canonical重编码。前端先JSON.stringify一次再hash，后端验hash、parse、验证后原文保存和返回。哈希位于envelope避免自引用。
- SaveRunEvents `{runId,summary}` -> `{status:'saved',runId,contentHash}`；GetRunEvents `{runId}` -> `{status:'available',summary}|{status:'missing_legacy'}`。summary hash由服务端产生；typed summary语义相同重试幂等。
- SaveRunReplay `{runId,replay:ReplayEnvelope}` -> `{status:'saved',runId,contentHash}`；GetRunReplay `{runId}` -> `{status:'available',replay:ReplayEnvelope}|{status:'missing_legacy'}|{status:'unsupported_version',formatVersion:number}`。
- summary HTTP最多2MiB且JSON对象最多1MiB；Replay HTTP最多8MiB、payloadJson UTF8最多6MiB。除 SaveMapDraft 的 64 KiB 外，其余API仍16KiB。先保存成绩，上传必须核验本人所有权、版本、规则/世界快照、事件对象引用以及终局；相同hash幂等，不同内容409。
- 云端上传只接受有冻结 `setup` 的新版局次。旧局次查询仍返回 `missing_legacy`，不能补造世界或录像。接触自爆会让录像中的无人机进入 `hp=0/state=destroyed`，但 `contact` 不计入成绩 `destroyed`；末帧死亡无人机包含玩家击毁和该次接触自爆。
- 摘要与录像分别保存，但同一局的重叠 `seq` 必须有完全一致的事件语义（包括时间、对象、位置、数值和详情）。后到的数据在同一局次行锁内核对另一张表；完整摘要必须包含录像内所有事件，完整录像必须包含摘要内所有事件。两者均为片段时只核对交集，冲突返回 409 且不覆盖已保存内容。
- 录制器预算提前于网络硬上限：完整最多10分钟、基础10Hz/关键段额外帧；达到预算转为最后30秒且标记ending-clip。玩家数据、全部无人机、正在飞行弹丸、工具、门、信标和镜头在片段首帧完整保留。最终序列化仍校验真实字节与HTTP envelope预算，必要时进一步裁短并如实更新fromMs。

## 文件所有权与集成

契约实现者拥有 frontend/src/objects 的新增/扩展、frontend/src/apis 的新增/扩展、shared/worlds 及 shared/missions，尽快向其他实现者通知可用 exports。后端 worlds/training 与 records 分别负责自己的服务。records 后端负责 system 注册/初始化/接口大小限制。game 实现者拥有 Training/game/core、mountGame、GameView。replay 实现者拥有 Training/game/recording、Replay 页和 system/replays。主代理整合 useTraining、Training index、Result、History。页面实现者负责 Missions/Loadout/Academy、Home、App/router。工坊实现者负责 Workshop/MapEditor。不要覆盖他人正在编辑的文件。

所有新功能需测试有意义的边界：版本冻结、归属、幂等、非法地图、目标不同胜利条件、干扰视线、只读回放/时间拖动。不能把样例轨迹当真实采集。

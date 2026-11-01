# 花谷行动 API 契约

本文件对应当前 Scala / TypeScript 实现：24 个业务 API，另有健康检查。**本轮联调中，最终以 [IMPLEMENTATION_QA.md](IMPLEMENTATION_QA.md) 为准。** 功能已落盘不等于浏览器、真实手机与真人试玩均已验收。

## 传输、身份与事务

所有业务调用使用 POST /api/<前端 API 类名小写>，例如 SaveRunReplayAPI 对应 /api/saverunreplayapi；后端同名消息加 Message 后缀。成功直接返回 DTO；失败返回 {code,message}。GET /api/health 返回 {status:'ok'|'unavailable',service:'nailong-backend'}。

- UUID 在线路上传字符串，在 Scala 与 TypeScript 中按 PlayerId、RunId、TrainingConfigId、MapId、MapVersionId 分别建类型；MissionId 为小写 slug。不同 ID 不可互换。
- 需要身份的调用由客户端基础设施附加 userToken。服务端验证令牌后注入可信 playerId/sessionId；受保护 API 拒绝客户端自带这两个身份字段。内部 ResolvePlayerTokenAPIMessage 不开放 HTTP。
- 时间点为带时区 ISO 8601；时长用非负整数毫秒，坐标米，速度米/秒，扫描角度为度、角速度弧度/秒。可空字段返回 null；新增 setup/objectiveProgress 的旧响应允许缺字段。
- 每个消息执行 plan(connection: Connection): IO[Response]，跨服务调用使用公开消息/表方法，并传递同一连接。只有外层 DatabaseSession 提交或回滚；SQL 与行映射封装在 Table，阻塞 JDBC 在 IO.blocking 中运行。
- 前端响应、URL 参数、JSON 与本地存储从 unknown 经过 runtime decoder；类型断言不代替校验。

| 请求类别 | HTTP 请求体上限 | 解码后的额外限制 |
|---|---:|---|
| 普通 API | 16 KiB | 各 DTO 的字段、分页与数值范围 |
| SaveMapDraftAPI | 64 KiB | 48 个掩体、8 架无人机及几何验证 |
| SaveRunEventsAPI | 2 MiB | 摘要 JSON 最多 1 MiB、10000 事件 |
| SaveRunReplayAPI | 8 MiB | payloadJson UTF-8 最多 6 MiB、12000 帧、10000 事件 |

超限、非法 UTF-8、非对象 JSON 返回 validation_error（400）。预算按实际 UTF-8 字节计算，不能用字符数替代上传限制。

## 24 个业务 API

表中请求省略自动添加的 userToken；无业务字段表示 {}。前端任务请求放 apis/training，后端任务目录由 worlds 管理。

| # | 前端 API 类 | 请求业务字段 | 返回类型 | 身份 / 所属服务 |
|---:|---|---|---|---|
| 1 | RegisterPlayerAPI | username, password, nickname | AuthResponse | 公开 / player |
| 2 | LoginPlayerAPI | username, password | AuthResponse | 公开 / player |
| 3 | GetCurrentPlayerAPI | 无 | PlayerProfile | 必须 / player |
| 4 | LogoutPlayerAPI | 无 | LogoutResponse | 必须 / player |
| 5 | GetTrainingConfigAPI | 无 | TrainingConfig | 公开 / training |
| 6 | StartTrainingRunAPI | requestId:UUID, configId, configVersion, terrain, selection?:RunSelection | TrainingRun | 必须 / training |
| 7 | GetTrainingRunAPI | runId | TrainingRun | 本人 / training |
| 8 | AbandonTrainingRunAPI | runId | AbandonRunResponse | 本人 / training |
| 9 | ListMissionsAPI | 无 | MissionListResponse | 公开 / worlds |
| 10 | GetMissionAPI | missionId | MissionDefinition | 公开 / worlds |
| 11 | ListMyMapsAPI | offset, limit | MapListResponse | 本人 / worlds |
| 12 | GetMapDraftAPI | mapId | MapDraft | 本人 / worlds |
| 13 | GetMapVersionAPI | mapVersionId | MapVersion | 已登录；内置或本人 / worlds |
| 14 | SaveMapDraftAPI | mapId, expectedRevision, title, world | MapDraft | 本人 / worlds |
| 15 | CloneMapAPI | mapVersionId | MapDraft | 已登录；复制内置或本人版本 / worlds |
| 16 | CreateMapVersionAPI | mapId, expectedRevision | MapVersion | 本人 / worlds |
| 17 | SaveTrainingResultAPI | runId, submission:ResultSubmission | TrainingResult | 本人 / records |
| 18 | GetTrainingResultAPI | runId | ResultLookupResponse | 本人 / records |
| 19 | ListMyResultsAPI | offset, limit | ResultListResponse | 本人 / records |
| 20 | GetMyBestAPI | configId, configVersion, terrain | PersonalBestResponse | 本人；仅旧清场配置 / records |
| 21 | SaveRunEventsAPI | runId, summary:RunEventSummary | RecordingSaveResponse | 本人且成绩已保存 / records |
| 22 | GetRunEventsAPI | runId | RunEventsLookupResponse | 本人 / records |
| 23 | SaveRunReplayAPI | runId, replay:ReplayEnvelope | RecordingSaveResponse | 本人且成绩已保存 / records |
| 24 | GetRunReplayAPI | runId | RunReplayLookupResponse | 本人 / records |

TypeScript 将保存确认类型命名 RecordingSavedResponse，Scala 为 RecordingSaveResponse；线路字段一致。

## 账号、规则与局次类型

以下仅为文档展开；源码中每个领域类型各有文件。

~~~ts
PlayerProfile = { id:PlayerId, username:string, nickname:string, createdAt:Instant }
AuthResponse = { player:PlayerProfile, userToken:SessionToken, expiresAt:Instant }
LogoutResponse = { loggedOut:true }
Point3 = { x:number, y:number, z:number }
TerrainConfig = { hillHeight:number, hillWidth:number, hillX:number, hillZ:number, ripple:number }
DroneSpawn = { x:number, z:number, yaw:number }
DroneRules = {
  maxHp:number, scanRange:number, scanFovDegrees:number,
  scanSpeed:number, alertSpeed:number, alertSeconds:number,
  hitScanSeconds:number, lostSightSeconds:number,
  patrolSpeed:number, chaseSpeed:number, patrolRadius:number,
  contactRadius:number, spawnGraceSeconds:number, spawns:DroneSpawn[]
}
WeaponConfig = { fireIntervalMs:number, projectileSpeed:number, projectileRange:number }
TrainingConfig = {
  id:TrainingConfigId, version:string, title:string,
  terrain:TerrainConfig, drones:DroneRules, weapon:WeaponConfig
}
ToolKind = 'none'|'curtain'|'decoy'|'pulse'
Loadout = { tool:ToolKind }
RunSelection = { missionId:MissionId, mapVersionId?:MapVersionId, loadout:Loadout }
RunSetup = {
  mission:MissionDefinition, world:WorldDefinition, mapVersionId:MapVersionId,
  loadout:Loadout, seed:number, assetVersion:'garden-v1'
}
TrainingRun = {
  id:RunId, playerId:PlayerId, requestId:UUID, config:TrainingConfig, terrain:TerrainConfig,
  status:'open'|'completed'|'abandoned', startedAt:Instant, completedAt:Instant|null,
  setup?:RunSetup|null
}
AbandonRunResponse = { run:TrainingRun }
~~~

用户名 trim 后小写，3–24 个 ASCII 字母/数字/下划线；昵称 1–24 个 Unicode 字符；密码至少 8 字符且受字节长度上限保护。数据库唯一约束处理并发注册。密码使用随机盐与 PBKDF2-HMAC-SHA256；令牌 32 随机字节编码成 43 字符 base64url，数据库只存 SHA-256 摘要，会话默认 7 天。

地形范围：hillHeight 0–4，hillWidth 2.5–9，hillX/hillZ −8–8，ripple 0–0.8。所有数值有限。maxHp 整数 1–20，spawns 长度 1–32，坐标 −80–80；scanRange 1–100，scanFovDegrees 10–360，scanSpeed/alertSpeed 0–100，patrolSpeed/chaseSpeed 0–20，patrolRadius 0–50，contactRadius 0.1–5，Seconds 字段 0–60；fireIntervalMs 整数 100–5000，projectileSpeed/projectileRange 1–100。yaw 可为任意有限弧度。

当前规则 ID 为 c8137000-0000-4000-8000-000000000001，版本 drone-hunt-v2。发布的配置不得原地覆盖；旧局保留原始快照。

Start 的 (playerId,requestId) 唯一。相同输入重试返回同一局；配置、地形或 selection 不同返回 409。省略 mapVersionId 和显式传默认版本是两份不同原始 selection。没有 selection 时保留旧四机模式；带 selection 时服务器解析当前任务及可读地图，要求请求 terrain 与 world.terrain 相同，将目标 marker、mapVersionId、工具、seed（0–2147483647）和素材版本冻结到 setup，config 快照的地形与 drone spawns 同步世界。过时规则返回 409。新一局必须生成新 requestId。

## 世界、任务与地图版本

~~~ts
WorldPoint = { x:number, z:number }
WorldSpawn = WorldPoint & { yaw:number }
WorldBounds = { halfSize:number }
WorldObject = WorldPoint & {
  id:string, kind:'crate'|'barrel'|'wall'|'gate', width:number, depth:number, height:number
}
WorldDrone = WorldSpawn & { id:string, patrol:WorldPoint[] }
WorldMarker = WorldPoint & { id:string, radius:number }
WorldDefinition = {
  schemaVersion:1, title:string, terrain:TerrainConfig, bounds:WorldBounds,
  spawn:WorldSpawn, objects:WorldObject[], drones:WorldDrone[],
  beacon:WorldMarker, extraction:WorldMarker
}
MissionObjective = { kind:'clear_drones' }
  | { kind:'activate_extract', beaconId:string, extractionId:string }
MissionDefinition = {
  id:MissionId, version:string, title:string, description:string,
  objective:MissionObjective, mapVersionId:MapVersionId,
  allowedTools:ToolKind[], configVersion:string
}
MissionListResponse = { missions:MissionDefinition[] }
MapDraft = { mapId:MapId, title:string, revision:number, world:WorldDefinition, updatedAt:Instant }
MapVersion = {
  id:MapVersionId, mapId:MapId, version:number, title:string,
  world:WorldDefinition, createdAt:Instant, builtIn:boolean
}
MapSummary = {
  mapId:MapId, title:string, revision:number, latestVersionId:MapVersionId|null,
  updatedAt:Instant, builtIn:boolean
}
MapListResponse = { maps:MapSummary[], total:number, templates:MapVersion[] }
MapValidationIssue = { code:string, message:string, objectId:string|null }
~~~

内置任务为 clear-drones（花谷清场）和 forest-beacon（点亮信标）；两个模板为 garden-courtyard（花谷旧庭院）与 forest-crossroads（林间交叉口）。共享 JSON 在 shared/worlds 与 shared/missions；后端资源副本由测试比对一致。

ListMyMaps 的 offset 为 0–100000，limit 为 1–100；前端默认 offset=0、limit=30。

MapId 表示作品，MapVersionId 表示冻结版本。CloneMap 创建本人草稿、初始 revision=1；SaveMapDraft 校验 expectedRevision 并递增修订号，冲突返回 409。CreateMapVersion 冻结指定修订，重复冻结同修订返回同一版本；旧版本和引用它的记录不随草稿变化。不可修改内置模板，应先复制。

地图校验：标题原始长度 1–80 且 trim 后非空，halfSize 12–48；objects 最多 48，width/depth 0.5–16、height 0.5–8；drones 1–8，每机 patrol 最多 12；marker.radius 0.6–4。所有静态对象、无人机、marker ID 全局唯一，匹配 /^[a-z][a-z0-9-]{0,63}$/；保留 player 与 projectile-/tool- 前缀，禁止静态地图使用。

对象 footprint 与 marker 圆不得越界或相互嵌入；出生圆半径 0.55，无人机与巡逻点半径 0.65。使用 1 米四邻接网格、0.55 米膨胀掩体与边段碰撞检查：出生→信标按门关闭，信标→撤离按门打开。自动验证不证明战斗难度合理，仍需真实试玩。门打开时同一实体停止阻挡移动、弹丸和视线。

## 成绩、保存与比较

~~~ts
ObjectiveProgress = { beaconActivated:boolean, extracted:boolean }
ResultSubmission = {
  outcome:'victory'|'defeat', shotsFired:number, hits:number, destroyed:number, elapsedMs:number,
  objectiveProgress?:ObjectiveProgress|null
}
TrainingResult = ResultSubmission & {
  runId:RunId, playerId:PlayerId, configId:TrainingConfigId, configVersion:string,
  terrain:TerrainConfig, accuracy:number, submittedAt:Instant, setup?:RunSetup|null
}
ResultLookupResponse = { result:TrainingResult|null }
ResultListResponse = { items:TrainingResult[], total:number, offset:number, limit:number }
PersonalBestResponse = { best:TrainingResult|null }
~~~

Save 锁定本人的 run。同 runId、同 submission 幂等；不同成绩或已放弃返回 409。插入结果与标记 completed 在同一事务提交；放弃与保存竞争同一行。旧成绩无 setup/目标进度仍可查询。

shotsFired/hits/destroyed/elapsedMs 为安全整数，shots≤1000000，elapsedMs≤86400000；hits≤shots，destroyed≤当局无人机数。设人数 n、血量 hp，则 destroyed×hp ≤ hits ≤ destroyed×hp+(n−destroyed)×(hp−1)。射速下限为 max(0,shots−2)×fireIntervalMs。

- 清场：胜利必须全毁且 hits=n×hp；失败不能全毁；不能声称已启动信标或撤离。
- 信标撤离：必须提交 objectiveProgress；胜利要求 activated+extracted，失败不能 extracted；允许不射击、未全毁时撤离胜利。
- 接触自爆在录像里呈现无人机 destroyed，但不计入玩家成绩 destroyed。

历史 offset 0–10000、limit 1–50，按 submittedAt 降序与 runId 稳定排序。GetMyBest 保留旧接口，只比较 setup=null 的同配置/版本/地形胜利。新任务档案的两局比较由前端要求地图版本、任务版本、目标、规则、地形和工具均相同；不能把跨任务成绩混成一个排行榜。

前端终局冻结 playerId/runId/submission；按账号+局次独立写入 localStorage 补传项。网络失败保留，重试复用同 runId；收到匹配本人、本局及全部成绩字段的响应才移除。objectiveProgress 参与幂等比较并冻结；旧缺字段与 null 兼容。收藏是按账号区分的**本机偏好**，不是数据库成绩，也不是跨设备同步功能。

## 事件与真实状态回放

~~~ts
RunEventKind = 'shot'|'hit'|'drone-state'|'destroyed'|'tool'|'beacon'|'gate'|'extract'|'contact'|'round-end'
RunEvent = {
  seq:number, tMs:number, kind:RunEventKind,
  actorId:string|null, targetId:string|null, position:Point3|null, value:number|null, detail:string|null
}
RunEventSummary = {
  formatVersion:1, runDurationMs:number, resultAtMs:number, truncated:boolean, events:RunEvent[]
}
ReplayPlayerState = {
  position:Point3, yaw:number, animation:'idle'|'walk'|'jump'|'aim',
  animationTime:number, aimWeight:number, alive:boolean
}
ReplayDroneState = {
  id:string, position:Point3, yaw:number, hp:number,
  state:'scanning'|'alert'|'locked'|'destroyed', flight:'taking-off'|'cruising'|'diving',
  stunned?:boolean // 脉冲推移瞬间不提前插值；旧数据缺失/null 按 false 读取
}
ReplayProjectileState = { id:string, position:Point3, direction:Point3 }
ReplayToolState = { id:string, kind:'curtain'|'decoy'|'pulse', position:Point3, radius:number, remainingMs:number, active:boolean }
ReplayCameraState = { position:Point3, target:Point3, fov:number }
ReplayWorldState = { openGateIds:string[], beaconActivated:boolean, extracted:boolean }
ReplayFrame = {
  tMs:number, scoreElapsedMs:number, throughEventSeq:number,
  player:ReplayPlayerState, drones:ReplayDroneState[], projectiles:ReplayProjectileState[],
  tools:ReplayToolState[], world:ReplayWorldState, camera:ReplayCameraState
}
ReplayCoverage = {
  kind:'complete'|'ending-clip', reason:null|'byte-limit'|'duration-limit'|'frame-limit',
  fromMs:number, toMs:number, runDurationMs:number, resultAtMs:number
}
ReplayManifest = {
  formatVersion:1, runId:RunId|null, config:TrainingConfig, world:WorldDefinition,
  mapVersionId:MapVersionId|null, missionId:string, assetVersion:'garden-v1',
  sampleHz:10, coverage:ReplayCoverage
}
ReplayPayload = { manifest:ReplayManifest, frames:ReplayFrame[], events:RunEvent[] }
ReplayEnvelope = { contentHash:string, payloadJson:string }
RecordingSaveResponse = { status:'saved', runId:RunId, contentHash:string }
RunEventsLookupResponse = { status:'available', summary:RunEventSummary } | { status:'missing_legacy' }
RunReplayLookupResponse = { status:'available', replay:ReplayEnvelope } | { status:'missing_legacy' }
  | { status:'unsupported_version', formatVersion:number }
~~~

contentHash 为 payloadJson **原文 UTF-8 字节**的 SHA-256 小写 hex。客户端 JSON.stringify 一次后计算哈希；服务端先验 hash，再 parse 和校验，原文保存返回。不同语言不通过重编码对象猜测相同哈希。摘要 hash 由服务器生成，语义相同的 typed summary 重试幂等。

云端仅接受成绩已保存、具有冻结 setup 的新版本人局次；核对 manifest 的规则/世界快照、局次、地图、素材版本、事件对象引用与终局。旧局返回 missing_legacy；格式不支持时返回 unsupported_version，不能生成替代录像。重复同内容幂等，已存在不同内容返回 409。

事件 seq 为 0–10000000 整数、严格递增，tMs 非递减；完整摘要从 seq0 开始，truncated 可省略前段。ID 长度 1–80，detail≤100，坐标绝对值≤1000，value绝对值≤1000000。drone-state.detail 为 locked:saw-player、alert:hit-unaware、alert:lost-sight 或 scanning:search-ended；round-end.detail 为胜负。引用 player / 静态 ID / 弹丸和工具实例，不使用不稳定数组下标。

帧 tMs 严格递增，scoreElapsedMs 和 throughEventSeq 非递减；每帧最多 32 架无人机、64 颗弹丸、16 个工具，无重复实体 ID。throughEventSeq 从 −1 开始，不得提前包含未来事件；门必须引用该世界中的 gate。累计 yaw 保留连续旋转（绝对值≤1000000）。

coverage 满足 fromMs≤resultAtMs≤toMs=runDurationMs≤86401200；首尾帧时间分别等于 fromMs/toMs。complete 必须 fromMs=0、reason=null；ending-clip 必须给裁剪原因，保留真实原始时间。录像内 events 只包含覆盖区间；summary 可覆盖更早时刻。终局视觉尾段最长 1200ms，不计入成绩耗时。

录制器基础 10Hz，在追击、死亡及事件发生时保留更多状态，关键连续段约 30Hz；完整录像最多 10 分钟。内存软预算约 5MiB、最终 payload 硬上限 6MiB；超过时长、帧数或体积预算转为最多末尾 30 秒，必要时进一步缩短，并明确显示 ending-clip。片段首帧包含当时所有实体、弹丸、工具和门状态，不补造早期事件。

事件与录像通过 IndexedDB 队列按账号/局次保存。成绩先提交，随后分别补传摘要与录像；它们失败不撤销已保存成绩。当前依赖浏览器存储配额，不主动淘汰待传数据；配额不足会提示并保留当前内存，登录、online、focus 与每 15 秒检查可重试本人项目。播放器从真实状态重建视图，只读播放/拖动，不运行当前 AI、不重新开局、不写成绩；移动与部分粒子为近似重建，不承诺像素级复现。

## 错误与兼容性

| code | HTTP | 含义 |
|---|---:|---|
| validation_error | 400 | 请求、参数、地图、事件或录像不合法 |
| unauthorized | 401 | 没有有效会话，需要原账号登录 |
| forbidden | 403 | 资源不属于当前账号或不允许修改 |
| not_found | 404 | 接口或指定资源不存在 |
| conflict | 409 | 过时版本、修订冲突、幂等输入不一致或局次状态冲突 |
| internal_error | 500 | 服务端内部失败，不返回秘密信息 |

断网属于客户端状态，不伪装为成功。/training 刷新申请新局，不拿旧 runId 重玩；/results/:runId、/replays/:runId 和 /history 可从本人数据库记录恢复。游客练习与课堂不创建正式账号成绩。真实手机性能、多人联网、公开作品社区和完整反作弊不在本轮已验证承诺内。

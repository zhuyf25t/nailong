# 成品 API 契约 · 无人机清除 v1

本文件约束前后端同时实现。最新玩法覆盖旧 README 的 30 秒圆靶；类型与事务规则继续遵循 `sample/rules.txt`。成功返回直接 DTO，错误为 `{ code, message }`。所有 API 使用 POST `/api/<前端API类名小写>`；后端 `XXXAPIMessage` 对应前端 `XXXAPI`。`GET /api/health` 为健康检查。

## 通用约定

- UUID 在线路上为字符串，Scala 包装类型、TypeScript 品牌类型不同 ID 不可互换。
- 时间点为有时区 ISO 8601 字符串，时长为非负整数毫秒；空值明确为 null。
- 需要身份的请求由 system/api 添加 `userToken`。路由验证令牌后注入可信 playerId/sessionId，客户端同名身份字段必须拒绝或忽略，不能覆盖。
- 普通对象一个文件；API 专用返回结构置于 objects/apiTypes。以下展开形状用于对齐，不要求把多个类型放进同一文件。
- 记录仅是客户端上报的个人训练结果；后端验证归属、规则和汇总合理性，不声称完整反作弊。

## 公开对象

```ts
PlayerProfile = { id: PlayerId; username: string; nickname: string; createdAt: Instant }
AuthResponse = { player: PlayerProfile; userToken: SessionToken; expiresAt: Instant }
LogoutResponse = { loggedOut: true }
Point3 = { x: number; y: number; z: number }
TerrainConfig = { hillHeight: number; hillWidth: number; hillX: number; hillZ: number; ripple: number }
DroneSpawn = { x: number; z: number; yaw: number }
DroneRules = {
  maxHp: number; scanRange: number; scanFovDegrees: number;
  scanSpeed: number; alertSpeed: number; alertSeconds: number;
  hitScanSeconds: number; lostSightSeconds: number;
  patrolSpeed: number; chaseSpeed: number; patrolRadius: number;
  contactRadius: number; spawnGraceSeconds: number;
  spawns: DroneSpawn[]
}
WeaponConfig = { fireIntervalMs: number; projectileSpeed: number; projectileRange: number }
TrainingConfig = {
  id: TrainingConfigId; version: string; title: string;
  terrain: TerrainConfig; drones: DroneRules; weapon: WeaponConfig
}
TrainingRun = {
  id: RunId; playerId: PlayerId; requestId: string;
  config: TrainingConfig; terrain: TerrainConfig;
  status: 'open' | 'completed' | 'abandoned';
  startedAt: Instant; completedAt: Instant | null
}
ResultSubmission = {
  outcome: 'victory' | 'defeat'; shotsFired: number; hits: number;
  destroyed: number; elapsedMs: number
}
TrainingResult = {
  runId: RunId; playerId: PlayerId; configId: TrainingConfigId;
  configVersion: string; terrain: TerrainConfig;
  outcome: 'victory' | 'defeat'; shotsFired: number; hits: number;
  destroyed: number; elapsedMs: number; accuracy: number; submittedAt: Instant
}
ResultLookupResponse = { result: TrainingResult | null }
ResultListResponse = { items: TrainingResult[]; total: number; offset: number; limit: number }
PersonalBestResponse = { best: TrainingResult | null }
AbandonRunResponse = { run: TrainingRun }
```

`scanSpeed/alertSpeed` 单位弧度/秒，速度单位米/秒，scanFovDegrees 单位度；其他 Seconds 字段单位秒。训练配置的所有字段都必须真实传入引擎并使用。初始参数以追击原型验收后的值为准，后端初始化配置文件与前端默认值保持可验证一致。前端不能静默忽略服务器参数。

## API 列表

| 前端 API 类 | 请求业务字段（不含自动附加令牌） | 返回 | 身份 |
| --- | --- | --- | --- |
| RegisterPlayerAPI | username, password, nickname | AuthResponse | 公开 |
| LoginPlayerAPI | username, password | AuthResponse | 公开 |
| GetCurrentPlayerAPI | 无 | PlayerProfile | 必须 |
| LogoutPlayerAPI | 无 | LogoutResponse | 必须 |
| GetTrainingConfigAPI | 无 | TrainingConfig | 公开、NoRequestMessage |
| StartTrainingRunAPI | requestId(UUID), configId, configVersion, terrain | TrainingRun | 必须 |
| GetTrainingRunAPI | runId | TrainingRun | 必须、本人 |
| AbandonTrainingRunAPI | runId | AbandonRunResponse | 必须、本人 |
| SaveTrainingResultAPI | runId, submission: ResultSubmission | TrainingResult | 必须、本人 |
| GetTrainingResultAPI | runId | ResultLookupResponse | 必须、本人 |
| ListMyResultsAPI | offset, limit | ResultListResponse | 必须、本人 |
| GetMyBestAPI | configId, configVersion, terrain | PersonalBestResponse | 必须、本人 |

内部 `ResolvePlayerTokenAPIMessage(token).plan(connection)` 返回可信 AuthenticatedPlayer（playerId, sessionId），不提供 HTTP 调用、不生成前端 API。

## 校验、幂等与事务

- 用户名 trim 后小写规范化，3–24 个 ASCII 字母/数字/下划线；昵称 1–24 字符；密码至少 8 字符并对字节长度设安全上限。数据库唯一约束保证并发不重名。密码加盐哈希，令牌强随机、只存摘要，默认会话 7 天。
- 地形范围与原型相同：hillHeight 0–4、hillWidth 2.5–9、hillX/hillZ −8–8、ripple 0–0.8。必须有限数值；缺字段不以 0 代替。
- 配置边界同时在 Scala 与 TypeScript 解码：maxHp 为 1–20 整数，spawns 长度 1–32、x/z 在 −80–80、yaw 任意有限值；scanRange 1–100，scanFovDegrees 10–360，scanSpeed/alertSpeed 0–100，patrolSpeed/chaseSpeed 0–20，patrolRadius 0–50，contactRadius 0.1–5，所有 Seconds 字段 0–60；fireIntervalMs 为 100–5000 整数，projectileSpeed/projectileRange 1–100。禁止静默截断不支持的配置。
- 默认配置固定 UUID `c8137000-0000-4000-8000-000000000001`，当前 version `drone-hunt-v2`。v2 加速巡逻与追击，锁定中的无人机受击继续追击，未发现玩家时受击才旋转搜索。数据库版本不可原地覆盖；旧 v1 局次与成绩保留其原始快照。
- Start 的 `(playerId, requestId)` 唯一；相同配置版本和地形重试返回同一局，不同输入 409。配置过时 409。新一局使用新 requestId。
- Save 锁定本人的 run；同 runId 同 submission 幂等返回，内容不同 409；已 abandoned 409。插入 result 与标记 completed 在同一事务完成。放弃也锁定同一行，与保存竞争时仅一个状态合法。
- shotsFired/hits/destroyed/elapsedMs 非负整数，hits≤shotsFired，destroyed≤无人机数。hits≥destroyed×maxHp，且未死无人机最多承受 maxHp−1 发；胜利要求全部击毁且 hits=总HP，失败必须尚有未击毁无人机。elapsedMs 至少为可发出这些子弹所需时间，允许一个射击间隔的边缘余量。避免 JSON 超大数字溢出。
- 个人最佳只比较相同 configId/version/地形参数的胜利，按 elapsedMs 升序、accuracy 降序、submittedAt 升序稳定排序。历史按 submittedAt 降序、runId 稳定排序；limit 1–50，offset 0–10000。
- 错误码有限集合：`validation_error`(400)、`unauthorized`(401)、`forbidden`(403)、`not_found`(404)、`conflict`(409)、`internal_error`(500)。网络错误属于前端本地状态，不伪装为服务器成功。

## 前端保存行为

正式局次的 playerId/runId/config 在开局冻结。终局先冻结 submission，再按 `{playerId,runId,submission}` 写待保存队列并发 Save。成功返回后移除；网络失败保留并显示“尚未保存，可重试”。队列从 unknown 严格解码，换号只提交当前账号项。再次点击保存复用 runId；新一局独立 requestId。

首页先展示游戏。开始行动/我的成绩需要登录，成功后接续一次；取消取消意图。`/training` 直接刷新不能沿用同 runId 重玩，需建立新局；`/results/:runId` 与 `/history` 可刷新查询数据库。练习区保持不需要账户，成绩明确只本地预览。

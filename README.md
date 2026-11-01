# 奶龙小靶场 · 花谷行动

前端 TypeScript + Vite + Three.js，后端 Scala + PostgreSQL。先看实际文件架构，再按后端服务、前端对应模块阅读。任务、工具、真实回放与地图创作代码已加入，自动化验证已通过；浏览器已验证正式败局结算、报告与真实回放，以及地图编辑保存、冻结和试玩载入。真实胜利路线、断网恢复与实体手机仍待验收，详细证据以 docs/IMPLEMENTATION_QA.md 为准。

## 当前完整代码架构

正式应用位于 `frontend/` 与 `backend/`；`threejs/` 保留渲染、操作和素材实验入口，并复用正式应用的游戏核心。下面完整展开这三部分及运行、验收文件，每个文件后的 `#` 说明用途。

排除依赖、构建产物、本机数据库/工具、下载缓存与凭据（如 `node_modules/`、`target/`、`dist/`、`.local/`、`.tools/`、`.asset-cache/`、`.npm-cache/`、`.env` 和 `.git/`）。这些文件不属于版本化源码。

<!-- FILE_TREE_START -->
```text
nailong/
├── backend/
│   ├── project/
│   │   └── build.properties  # 固定 sbt 版本
│   ├── src/
│   │   ├── main/
│   │   │   ├── resources/
│   │   │   │   ├── missions/
│   │   │   │   │   ├── clear-drones.json  # 清场任务的版本、默认地图和工具选项
│   │   │   │   │   └── forest-beacon.json  # 信标撤离任务的目标与可选工具
│   │   │   │   ├── worlds/
│   │   │   │   │   ├── forest-crossroads.json  # 具有庭院隔断与四架巡逻无人机的内置世界
│   │   │   │   │   ├── garden-courtyard.json  # 三分区、左右入口和捷径门的内置庭院
│   │   │   │   │   └── templates.json  # 两个内置世界的冻结版本与元数据
│   │   │   │   └── game-config.json  # 当前 drone-hunt-v2 规则版本与默认地形
│   │   │   └── scala/
│   │   │       └── services/
│   │   │           ├── player/
│   │   │           │   ├── api/
│   │   │           │   │   ├── GetCurrentPlayerAPIMessage.scala  # 执行：读取当前公开玩家资料
│   │   │           │   │   ├── LoginPlayerAPIMessage.scala  # 执行：验证密码并登录
│   │   │           │   │   ├── LogoutPlayerAPIMessage.scala  # 执行：撤销当前会话
│   │   │           │   │   ├── RegisterPlayerAPIMessage.scala  # 执行：注册账号并签发会话
│   │   │           │   │   └── ResolvePlayerTokenAPIMessage.scala  # 执行：验证令牌得到可信身份，仅后端内部
│   │   │           │   ├── objects/
│   │   │           │   │   ├── apiTypes/
│   │   │           │   │   │   ├── AuthResponse.scala  # 注册或登录成功后的玩家、令牌与过期时间
│   │   │           │   │   │   └── LogoutResponse.scala  # 当前会话注销结果
│   │   │           │   │   ├── AuthenticatedPlayer.scala  # 令牌验证后可信的玩家与会话身份
│   │   │           │   │   ├── PlayerId.scala  # 玩家 UUID，避免与其他 ID 混用
│   │   │           │   │   ├── PlayerProfile.scala  # 不含秘密字段的公开玩家资料
│   │   │           │   │   ├── SessionId.scala  # 服务端会话 UUID，仅内部使用
│   │   │           │   │   ├── SessionToken.scala  # 不透明会话令牌的类型与校验
│   │   │           │   │   ├── StoredPlayer.scala  # 包含密码哈希的内部玩家记录
│   │   │           │   │   └── StoredSession.scala  # 含令牌摘要、归属和有效期的内部会话记录
│   │   │           │   ├── routes/
│   │   │           │   │   └── PlayerRoutes.scala  # 声明本服务面向浏览器的消息注册表
│   │   │           │   ├── tables/
│   │   │           │   │   ├── player/
│   │   │           │   │   │   ├── PlayerTable.scala  # 封装账号表的 SQL、行映射和公开 IO 方法
│   │   │           │   │   │   └── PlayerTableInitializer.scala  # 初始化账号表、约束与索引
│   │   │           │   │   └── playersession/
│   │   │           │   │       ├── PlayerSessionTable.scala  # 封装会话表的 SQL、行映射和公开 IO 方法
│   │   │           │   │       └── PlayerSessionTableInitializer.scala  # 初始化会话表、约束与索引
│   │   │           │   └── utils/
│   │   │           │       ├── PlayerSecrets.scala  # 密码加盐哈希、令牌生成与摘要
│   │   │           │       ├── PlayerSession.scala  # 本服务创建有效会话的组合逻辑
│   │   │           │       └── PlayerValidation.scala  # 本服务账号、昵称和密码输入校验
│   │   │           ├── records/
│   │   │           │   ├── api/
│   │   │           │   │   ├── GetMyBestAPIMessage.scala  # 读取同配置版本和地形的旧标准清场最快胜利
│   │   │           │   │   ├── GetRunEventsAPIMessage.scala  # 执行：读取本人真实事件摘要
│   │   │           │   │   ├── GetRunReplayAPIMessage.scala  # 执行：读取本人回放与兼容状态
│   │   │           │   │   ├── GetTrainingResultAPIMessage.scala  # 执行：查询本人单局成绩
│   │   │           │   │   ├── ListMyResultsAPIMessage.scala  # 执行：分页查询本人历史
│   │   │           │   │   ├── SaveRunEventsAPIMessage.scala  # 执行：保存本人已结算行动的事件摘要
│   │   │           │   │   ├── SaveRunReplayAPIMessage.scala  # 执行：校验并保存本人真实状态回放
│   │   │           │   │   └── SaveTrainingResultAPIMessage.scala  # 执行：校验并幂等保存本人终局
│   │   │           │   ├── objects/
│   │   │           │   │   ├── apiTypes/
│   │   │           │   │   │   ├── PersonalBestResponse.scala  # 同地图同规则最快胜利或空值
│   │   │           │   │   │   ├── RecordingSaveResponse.scala  # 过程上传成功后的局次与内容哈希
│   │   │           │   │   │   ├── ResultListResponse.scala  # 个人历史列表及分页信息
│   │   │           │   │   │   ├── ResultLookupResponse.scala  # 单局成绩或尚无成绩的返回结构
│   │   │           │   │   │   ├── RunEventsLookupResponse.scala  # 可用摘要或旧记录缺少过程的有限状态
│   │   │           │   │   │   └── RunReplayLookupResponse.scala  # 可用回放、缺失与版本不兼容的有限状态
│   │   │           │   │   ├── ObjectiveProgress.scala  # 信标激活与撤离进度的布尔类型
│   │   │           │   │   ├── ReplayCameraState.scala  # 录像镜头位置、目标与视场角
│   │   │           │   │   ├── ReplayCoverage.scala  # 完整录像或真实末尾片段的时间范围
│   │   │           │   │   ├── ReplayDroneState.scala  # 录像无人机位置、血量、朝向和飞行阶段
│   │   │           │   │   ├── ReplayEnvelope.scala  # 原始录像 JSON 与 SHA-256 字节哈希
│   │   │           │   │   ├── ReplayFrame.scala  # 同一时刻实体、镜头及已包含事件序号
│   │   │           │   │   ├── ReplayManifest.scala  # 局次和冻结世界、规则、素材及覆盖元数据
│   │   │           │   │   ├── ReplayPayload.scala  # 录像元数据、状态帧和覆盖区间事件
│   │   │           │   │   ├── ReplayPlayerState.scala  # 录像角色位置、动画、瞄准与存活状态
│   │   │           │   │   ├── ReplayProjectileState.scala  # 活动弹丸实例、位置与方向
│   │   │           │   │   ├── ReplayToolState.scala  # 录像工具实例、半径及剩余时间
│   │   │           │   │   ├── ReplayWorldState.scala  # 已开启门和信标、撤离目标状态
│   │   │           │   │   ├── ResultOutcome.scala  # 后端 victory/defeat 胜负枚举
│   │   │           │   │   ├── ResultSubmission.scala  # 终局胜负、射击统计与可选任务进度
│   │   │           │   │   ├── RunEvent.scala  # 带序号和时刻的真实动作与对象引用
│   │   │           │   │   ├── RunEventSummary.scala  # 有界行动事件、终局时间与裁剪标记
│   │   │           │   │   ├── StoredRunEvents.scala  # 数据库内部已保存事件摘要与归属
│   │   │           │   │   ├── StoredRunReplay.scala  # 数据库内部原始回放、归属与哈希
│   │   │           │   │   └── TrainingResult.scala  # 持久化的归属、胜负、命中、用时与规则信息
│   │   │           │   ├── routes/
│   │   │           │   │   └── RecordsRoutes.scala  # 声明本服务面向浏览器的消息注册表
│   │   │           │   ├── tables/
│   │   │           │   │   ├── runeventsummary/
│   │   │           │   │   │   ├── RunEventSummaryTable.scala  # 封装行动事件摘要表的 SQL 和公开 IO 方法
│   │   │           │   │   │   └── RunEventSummaryTableInitializer.scala  # 初始化行动事件摘要表、约束与索引
│   │   │           │   │   ├── runreplay/
│   │   │           │   │   │   ├── RunReplayTable.scala  # 封装原始状态回放表的 SQL 和公开 IO 方法
│   │   │           │   │   │   └── RunReplayTableInitializer.scala  # 初始化原始状态回放表、约束与索引
│   │   │           │   │   └── trainingresult/
│   │   │           │   │       ├── TrainingResultTable.scala  # 封装终局成绩表的 SQL、行映射和公开 IO 方法
│   │   │           │   │       └── TrainingResultTableInitializer.scala  # 初始化终局成绩表、约束与索引
│   │   │           │   └── utils/
│   │   │           │       ├── RecordingAccess.scala  # 限制过程上传为本人已完成且有冻结世界的局次
│   │   │           │       ├── RecordingCodecs.scala  # 事件和录像字段、范围与有限状态解码
│   │   │           │       ├── RecordingValidation.scala  # 验证回放顺序、对象引用、冻结快照及终局一致性
│   │   │           │       └── ResultValidation.scala  # 本服务校验汇总合理性和重复提交一致性
│   │   │           ├── system/
│   │   │           │   ├── api/
│   │   │           │   │   ├── APIMessage.scala  # 定义 plan(connection): IO[Response] 的消息执行入口
│   │   │           │   │   ├── APIMessageRouter.scala  # 统一 HTTP 解码、身份转换、事务与错误响应
│   │   │           │   │   ├── APIWithTokenMessage.scala  # 需要可信身份的消息类别
│   │   │           │   │   ├── NoRequestMessage.scala  # 无业务请求字段的消息类别
│   │   │           │   │   └── RegisteredAPIMessage.scala  # 消息名称、解码、执行和响应编码的注册项
│   │   │           │   ├── objects/
│   │   │           │   │   ├── DatabaseConfig.scala  # 读取并校验 PostgreSQL 连接配置
│   │   │           │   │   ├── ErrorCode.scala  # 服务器有限业务错误码
│   │   │           │   │   ├── ErrorResponse.scala  # 对外错误 code/message 结构
│   │   │           │   │   ├── HealthResponse.scala  # 健康检查返回结构
│   │   │           │   │   ├── HttpError.scala  # 带状态码的后端业务失败
│   │   │           │   │   └── TimeCodecs.scala  # 时区时间点的 JSON 编解码
│   │   │           │   ├── routes/
│   │   │           │   │   └── ApiRouter.scala  # 合并业务消息注册并提供健康检查
│   │   │           │   ├── DatabaseInitializer.scala  # 按外键依赖组合各表初始化
│   │   │           │   ├── DatabaseSession.scala  # 管理连接池、事务提交回滚与资源生命周期
│   │   │           │   └── Main.scala  # Scala IOApp 入口，连接数据库并启动 HTTP
│   │   │           ├── training/
│   │   │           │   ├── api/
│   │   │           │   │   ├── AbandonTrainingRunAPIMessage.scala  # 执行：锁定并放弃本人未完成局次
│   │   │           │   │   ├── GetTrainingConfigAPIMessage.scala  # 执行：读取当前版本规则
│   │   │           │   │   ├── GetTrainingRunAPIMessage.scala  # 执行：查询本人局次及快照
│   │   │           │   │   └── StartTrainingRunAPIMessage.scala  # 执行：幂等创建并冻结局次
│   │   │           │   ├── objects/
│   │   │           │   │   ├── apiTypes/
│   │   │           │   │   │   └── AbandonRunResponse.scala  # 放弃操作返回的局次状态
│   │   │           │   │   ├── DroneRules.scala  # 血量、扫描、搜索、巡逻、追击与接触规则
│   │   │           │   │   ├── DroneSpawn.scala  # 无人机出生位置与朝向
│   │   │           │   │   ├── Loadout.scala  # 每局所选一次性工具
│   │   │           │   │   ├── Point3.scala  # 以米为单位的三维纯数据坐标
│   │   │           │   │   ├── RunId.scala  # 一次行动的 UUID，也是保存去重键
│   │   │           │   │   ├── RunSelection.scala  # 开局请求的任务、地图版本与工具选择
│   │   │           │   │   ├── RunSetup.scala  # 本局冻结任务、世界、工具、种子和素材版本
│   │   │           │   │   ├── TerrainConfig.scala  # 可调整山丘高度、宽度、位置与起伏
│   │   │           │   │   ├── TrainingConfig.scala  # 版本化地形、无人机和武器规则
│   │   │           │   │   ├── TrainingConfigId.scala  # 玩法配置的独立 UUID 类型
│   │   │           │   │   ├── TrainingRun.scala  # 冻结账号、规则、地形和状态的局次
│   │   │           │   │   ├── TrainingRunStatus.scala  # 后端局次 open/completed/abandoned 状态
│   │   │           │   │   └── WeaponConfig.scala  # 射击间隔、弹速和射程
│   │   │           │   ├── routes/
│   │   │           │   │   └── TrainingRoutes.scala  # 声明本服务面向浏览器的消息注册表
│   │   │           │   ├── tables/
│   │   │           │   │   ├── trainingconfig/
│   │   │           │   │   │   ├── TrainingConfigTable.scala  # 封装版本配置表的 SQL、行映射和公开 IO 方法
│   │   │           │   │   │   └── TrainingConfigTableInitializer.scala  # 初始化版本配置表、约束与索引
│   │   │           │   │   └── trainingrun/
│   │   │           │   │       ├── TrainingRunTable.scala  # 封装局次与冻结快照表的 SQL、行映射和公开 IO 方法
│   │   │           │   │       └── TrainingRunTableInitializer.scala  # 初始化局次与冻结快照表、约束与索引
│   │   │           │   └── utils/
│   │   │           │       ├── TrainingConfigResource.scala  # 解析并校验随后端发布的初始规则
│   │   │           │       ├── ValidateRunSelection.scala  # 校验任务版本和工具并组合冻结开局快照
│   │   │           │       └── ValidateTerrain.scala  # 本服务地形参数范围校验
│   │   │           └── worlds/
│   │   │               ├── api/
│   │   │               │   ├── CloneMapAPIMessage.scala  # 执行：复制可读版本为本人的新草稿
│   │   │               │   ├── CreateMapVersionAPIMessage.scala  # 执行：冻结草稿修订并幂等生成版本
│   │   │               │   ├── GetMapDraftAPIMessage.scala  # 执行：读取本人当前地图草稿
│   │   │               │   ├── GetMapVersionAPIMessage.scala  # 执行：读取内置或本人冻结地图版本
│   │   │               │   ├── GetMissionAPIMessage.scala  # 执行：读取公开任务及目标定义
│   │   │               │   ├── ListMissionsAPIMessage.scala  # 执行：列出公开任务目录
│   │   │               │   ├── ListMyMapsAPIMessage.scala  # 执行：分页查询本人作品并返回内置模板
│   │   │               │   └── SaveMapDraftAPIMessage.scala  # 执行：按预期修订号保存并验证地图草稿
│   │   │               ├── objects/
│   │   │               │   ├── apiTypes/
│   │   │               │   │   ├── MapListResponse.scala  # 本人作品分页结果及内置模板
│   │   │               │   │   └── MissionListResponse.scala  # 公开任务列表响应
│   │   │               │   ├── MapDraft.scala  # 带可变修订号的本人地图草稿
│   │   │               │   ├── MapId.scala  # 地图作品 UUID 品牌，区别于版本身份
│   │   │               │   ├── MapSummary.scala  # 作品列表的修订号与最新版本概览
│   │   │               │   ├── MapValidationIssue.scala  # 地图错误码、说明及可定位实体编号
│   │   │               │   ├── MapVersion.scala  # 带稳定 UUID 的不可变世界版本
│   │   │               │   ├── MapVersionId.scala  # 冻结地图版本 UUID 品牌
│   │   │               │   ├── MissionDefinition.scala  # 任务版本、目标、默认地图和可选工具
│   │   │               │   ├── MissionId.scala  # 任务小写标识的独立类型与校验
│   │   │               │   ├── MissionObjective.scala  # 清场或激活撤离的目标联合类型
│   │   │               │   ├── ToolKind.scala  # 不带工具、干扰幕、诱饵和脉冲的有限集合
│   │   │               │   ├── WorldBounds.scala  # 可玩地图半径与范围约束
│   │   │               │   ├── WorldDefinition.scala  # 渲染、碰撞、任务和回放共同读取的世界定义
│   │   │               │   ├── WorldDrone.scala  # 稳定无人机编号、出生朝向和巡逻点
│   │   │               │   ├── WorldMarker.scala  # 信标或撤离点位置与交互半径
│   │   │               │   ├── WorldObject.scala  # 箱桶、墙门的稳定编号、位置和尺寸
│   │   │               │   ├── WorldObjectKind.scala  # 有限的世界实体种类
│   │   │               │   ├── WorldPoint.scala  # 世界平面 x/z 坐标
│   │   │               │   └── WorldSpawn.scala  # 角色或无人机出生坐标和朝向
│   │   │               ├── routes/
│   │   │               │   └── WorldsRoutes.scala  # 注册公开任务及受身份保护的地图接口
│   │   │               ├── tables/
│   │   │               │   ├── mapdraft/
│   │   │               │   │   ├── MapDraftTable.scala  # 封装作品归属与最新草稿表的 SQL 和公开 IO 方法
│   │   │               │   │   └── MapDraftTableInitializer.scala  # 初始化作品归属与最新草稿表、约束与索引
│   │   │               │   ├── mapversion/
│   │   │               │   │   ├── MapVersionTable.scala  # 封装不可变世界版本表的 SQL 和公开 IO 方法
│   │   │               │   │   └── MapVersionTableInitializer.scala  # 初始化不可变世界版本表、约束与索引
│   │   │               │   └── mission/
│   │   │               │       ├── MissionTable.scala  # 封装公开任务版本表的 SQL 和公开 IO 方法
│   │   │               │       └── MissionTableInitializer.scala  # 初始化公开任务版本表、约束与索引
│   │   │               ├── utils/
│   │   │               │   ├── ValidateWorld.scala  # 独立验证地图预算、重叠和门前后可达路线
│   │   │               │   ├── WorldResources.scala  # 读取并核对共享内置模板与任务资源
│   │   │               │   └── WorldWireCodecs.scala  # 世界请求线路类型的严格 JSON 解码
│   │   │               └── WorldInitializer.scala  # 按依赖初始化世界表、内置地图与任务
│   │   └── test/
│   │       └── scala/
│   │           └── services/
│   │               ├── player/
│   │               │   └── PlayerSecuritySuite.scala  # 密码哈希、令牌和账号输入校验测试
│   │               ├── records/
│   │               │   ├── RecordingIntegrationSuite.scala  # 真实数据库的回放归属、幂等、哈希与预算测试
│   │               │   └── ResultValidationSuite.scala  # 胜负、血量汇总和射速合理性测试
│   │               ├── training/
│   │               │   ├── TrainingSelectionIntegrationSuite.scala  # 冻结任务选择、世界和幂等请求的集成测试
│   │               │   └── TrainingValidationSuite.scala  # 局次规则、地形范围与配置校验测试
│   │               ├── worlds/
│   │               │   ├── WorldStorageIntegrationSuite.scala  # 本人草稿、修订冲突和不可变版本数据库测试
│   │               │   └── WorldValidationSuite.scala  # 地图预算、实体冲突与两阶段可达性测试
│   │               ├── BackendIntegrationSuite.scala  # 真实数据库、认证、归属与并发事务测试
│   │               └── ContractFixtureSuite.scala  # 前后端共享 JSON 样本的真实 Circe 契约检查
│   └── build.sbt  # Scala 版本、后端依赖、入口与测试配置
├── docs/
│   ├── screenshots/
│   │   ├── auth-390px.png  # 浏览器实际截图：auth-390px
│   │   ├── drone-takeoff.png  # 浏览器实际截图：drone-takeoff
│   │   ├── drone-v2-result.png  # 浏览器实际截图：drone-v2-result
│   │   ├── drone-v2-victory.png  # 5173 自由练习 v2 四机全毁实测，不写账号成绩
│   │   ├── home-390px.png  # 浏览器实际截图：home-390px
│   │   ├── home-desktop.png  # 浏览器实际截图：home-desktop
│   │   └── result-from-database.png  # 浏览器实际截图：result-from-database
│   ├── API_CONTRACT.md  # 前后端消息、字段、单位和失败契约
│   ├── DEMO_3_MINUTES.md  # 三分钟介绍顺序、时间分配与演示动作
│   ├── expansion-http-verification.json  # 34 项实际 HTTP 协议验收脱敏结果，含合成协议数据
│   ├── expansion-live-recording-verification.json  # 只读核对实际游玩败局的已保存成绩、事件与录像证据
│   ├── IMPLEMENTATION_CONTRACT.md  # A–C 扩展跨模块字段、预算和所有权约定
│   ├── IMPLEMENTATION_QA.md  # 本轮联调验收结果、证据与未覆盖项
│   ├── REQUIREMENTS_AUDIT.md  # 用户要求、课程规则与完整验收清单
│   ├── UI_DIRECTION.md  # 页面视觉方向与各交互状态设计
│   └── VERIFICATION.md  # 实际测试、数据库和浏览器验收证据
├── frontend/
│   ├── public/
│   │   ├── art/
│   │   │   ├── game-preview.png  # 浏览器或素材实际截图：game-preview
│   │   │   └── menu-garden.png  # 首页花谷游戏主视觉插画
│   │   ├── assets/
│   │   │   ├── arena/
│   │   │   │   ├── eye-drone.glb  # 运行用无人机模型与动作
│   │   │   │   ├── License_Fantasy_Standard.txt  # 箱桶素材原始许可
│   │   │   │   ├── License_SciFi_Standard.txt  # 无人机素材原始许可
│   │   │   │   ├── manifest.json  # 所属素材集合的来源、节点与尺寸清单
│   │   │   │   └── props.glb  # 运行用 Fantasy 箱桶素材集合
│   │   │   ├── models/
│   │   │   │   ├── asset-info.json  # 本地生成 GLB 的尺寸、节点和动画清单
│   │   │   │   ├── bubble-gun.glb  # 紧凑脉冲枪，沿用旧文件名，含 muzzle
│   │   │   │   ├── bush.glb  # 历史程序灌木原型
│   │   │   │   ├── crate.glb  # 历史程序木箱原型
│   │   │   │   ├── nailong.glb  # 本地梨形角色，含四段动画和挂枪节点
│   │   │   │   ├── rock.glb  # 历史程序岩石原型
│   │   │   │   ├── target.glb  # 历史圆靶原型，保留素材实验使用
│   │   │   │   ├── tree.glb  # 历史程序树原型
│   │   │   │   └── wall-segment.glb  # 历史程序矮墙段原型
│   │   │   └── nature/
│   │   │       ├── License_Standard.txt  # 自然素材 Standard 原始许可
│   │   │       ├── manifest.json  # 所属素材集合的来源、节点与尺寸清单
│   │   │       ├── megakit-lod.json  # 植被离线 LOD 网格数据
│   │   │       └── megakit.glb  # 精选自然植被和岩石模型集合
│   │   └── ASSET_CREDITS.md  # 实际素材来源、作者、许可与修改记录
│   ├── qa/
│   │   └── responsive.html  # 本机多视口响应式检查页，不是正式游戏路由
│   ├── scripts/
│   │   ├── check-api-names.mjs  # 检查生产构建后的 API 类名与路由契约
│   │   └── production-module-harness.mjs  # 读取实际生产包及依赖图以验证 API 名称与运行边界
│   ├── src/
│   │   ├── apis/
│   │   │   ├── player/
│   │   │   │   ├── GetCurrentPlayerAPI.ts  # 调用：读取当前公开玩家资料
│   │   │   │   ├── LoginPlayerAPI.ts  # 调用：验证密码并登录
│   │   │   │   ├── LogoutPlayerAPI.ts  # 调用：撤销当前会话
│   │   │   │   └── RegisterPlayerAPI.ts  # 调用：注册账号并签发会话
│   │   │   ├── records/
│   │   │   │   ├── GetMyBestAPI.ts  # 读取同配置版本和地形的旧标准清场最快胜利
│   │   │   │   ├── GetRunEventsAPI.ts  # 请求：读取本人真实事件摘要
│   │   │   │   ├── GetRunReplayAPI.ts  # 请求：读取本人回放与兼容状态
│   │   │   │   ├── GetTrainingResultAPI.ts  # 调用：查询本人单局成绩
│   │   │   │   ├── ListMyResultsAPI.ts  # 调用：分页查询本人历史
│   │   │   │   ├── SaveRunEventsAPI.ts  # 请求：保存本人已结算行动的事件摘要
│   │   │   │   ├── SaveRunReplayAPI.ts  # 请求：校验并保存本人真实状态回放
│   │   │   │   └── SaveTrainingResultAPI.ts  # 调用：校验并幂等保存本人终局
│   │   │   ├── training/
│   │   │   │   ├── AbandonTrainingRunAPI.ts  # 调用：锁定并放弃本人未完成局次
│   │   │   │   ├── GetMissionAPI.ts  # 请求：读取公开任务及目标定义
│   │   │   │   ├── GetTrainingConfigAPI.ts  # 调用：读取当前版本规则
│   │   │   │   ├── GetTrainingRunAPI.ts  # 调用：查询本人局次及快照
│   │   │   │   ├── ListMissionsAPI.ts  # 请求：列出公开任务目录
│   │   │   │   └── StartTrainingRunAPI.ts  # 调用：幂等创建并冻结局次
│   │   │   └── worlds/
│   │   │       ├── CloneMapAPI.ts  # 请求：复制可读版本为本人的新草稿
│   │   │       ├── CreateMapVersionAPI.ts  # 请求：冻结草稿修订并幂等生成版本
│   │   │       ├── GetMapDraftAPI.ts  # 请求：读取本人当前地图草稿
│   │   │       ├── GetMapVersionAPI.ts  # 请求：读取内置或本人冻结地图版本
│   │   │       ├── ListMyMapsAPI.ts  # 请求：分页查询本人作品并返回内置模板
│   │   │       └── SaveMapDraftAPI.ts  # 请求：按预期修订号保存并验证地图草稿
│   │   ├── components/
│   │   │   └── ui/
│   │   │       ├── Button.tsx  # 通用按钮外观、交互与禁用状态
│   │   │       ├── Input.tsx  # 通用输入框与可访问表单外观
│   │   │       ├── Modal.tsx  # 带焦点管理的 Radix 基础弹窗
│   │   │       └── StatusPanel.tsx  # 加载、错误、空状态的统一展示
│   │   ├── objects/
│   │   │   ├── player/
│   │   │   │   ├── apiTypes/
│   │   │   │   │   ├── AuthResponse.ts  # 注册或登录成功后的玩家、令牌与过期时间
│   │   │   │   │   └── LogoutResponse.ts  # 当前会话注销结果
│   │   │   │   ├── PlayerId.ts  # 玩家 UUID，避免与其他 ID 混用
│   │   │   │   └── PlayerProfile.ts  # 不含秘密字段的公开玩家资料
│   │   │   ├── records/
│   │   │   │   ├── apiTypes/
│   │   │   │   │   ├── PersonalBestResponse.ts  # 同地图同规则最快胜利或空值
│   │   │   │   │   ├── RecordingSavedResponse.ts  # 过程上传成功后的局次与内容哈希
│   │   │   │   │   ├── ResultListResponse.ts  # 个人历史列表及分页信息
│   │   │   │   │   ├── ResultLookupResponse.ts  # 单局成绩或尚无成绩的返回结构
│   │   │   │   │   ├── RunEventsLookupResponse.ts  # 可用摘要或旧记录缺少过程的有限状态
│   │   │   │   │   └── RunReplayLookupResponse.ts  # 可用回放、缺失与版本不兼容的有限状态
│   │   │   │   ├── ObjectiveProgress.ts  # 信标激活与撤离进度的布尔类型
│   │   │   │   ├── RecordedRun.ts  # 录制完成后分离的事件摘要和回放信封
│   │   │   │   ├── ReplayCameraState.ts  # 录像镜头位置、目标与视场角
│   │   │   │   ├── ReplayCoverage.ts  # 完整录像或真实末尾片段的时间范围
│   │   │   │   ├── replayDecode.ts  # 回放时间、字节预算、数值及公共解码约束
│   │   │   │   ├── ReplayDroneState.ts  # 录像无人机位置、血量、朝向和飞行阶段
│   │   │   │   ├── ReplayEnvelope.ts  # 原始录像 JSON 与 SHA-256 字节哈希
│   │   │   │   ├── ReplayFrame.ts  # 同一时刻实体、镜头及已包含事件序号
│   │   │   │   ├── ReplayManifest.ts  # 局次和冻结世界、规则、素材及覆盖元数据
│   │   │   │   ├── ReplayPayload.ts  # 录像元数据、状态帧和覆盖区间事件
│   │   │   │   ├── ReplayPlayerState.ts  # 录像角色位置、动画、瞄准与存活状态
│   │   │   │   ├── ReplayProjectileState.ts  # 活动弹丸实例、位置与方向
│   │   │   │   ├── ReplayToolState.ts  # 录像工具实例、半径及剩余时间
│   │   │   │   ├── ReplayWorldState.ts  # 已开启门和信标、撤离目标状态
│   │   │   │   ├── ResultSubmission.ts  # 终局胜负、射击统计与可选任务进度
│   │   │   │   ├── RunEvent.ts  # 带序号和时刻的真实动作与对象引用
│   │   │   │   ├── runEventLabel.ts  # 将真实事件转换成报告和时间轴说明
│   │   │   │   ├── RunEventSummary.ts  # 有界行动事件、终局时间与裁剪标记
│   │   │   │   ├── RunOutcome.ts  # 前端 victory/defeat 胜负类型及解码
│   │   │   │   └── TrainingResult.ts  # 持久化的归属、胜负、命中、用时与规则信息
│   │   │   ├── system/
│   │   │   │   ├── Instant.ts  # 带时区 ISO 时间字符串的品牌类型与解码
│   │   │   │   └── SessionToken.ts  # 不透明会话令牌的类型与校验
│   │   │   ├── training/
│   │   │   │   ├── apiTypes/
│   │   │   │   │   └── AbandonRunResponse.ts  # 放弃操作返回的局次状态
│   │   │   │   ├── builtinCatalog.ts  # 解码共享任务与模板并生成离线练习配置
│   │   │   │   ├── DroneRules.ts  # 血量、扫描、搜索、巡逻、追击与接触规则
│   │   │   │   ├── DroneSpawn.ts  # 无人机出生位置与朝向
│   │   │   │   ├── Loadout.ts  # 每局所选一次性工具
│   │   │   │   ├── MissionDefinition.ts  # 任务版本、目标、默认地图和可选工具
│   │   │   │   ├── MissionId.ts  # 任务小写标识的独立类型与校验
│   │   │   │   ├── MissionListResponse.ts  # 公开任务列表响应
│   │   │   │   ├── MissionObjective.ts  # 清场或激活撤离的目标联合类型
│   │   │   │   ├── Point3.ts  # 以米为单位的三维纯数据坐标
│   │   │   │   ├── RunId.ts  # 一次行动的 UUID，也是保存去重键
│   │   │   │   ├── RunSelection.ts  # 开局请求的任务、地图版本与工具选择
│   │   │   │   ├── RunSetup.ts  # 本局冻结任务、世界、工具、种子和素材版本
│   │   │   │   ├── RunStatus.ts  # 前端局次有限状态及解码
│   │   │   │   ├── TerrainConfig.ts  # 可调整山丘高度、宽度、位置与起伏
│   │   │   │   ├── ToolKind.ts  # 不带工具、干扰幕、诱饵和脉冲的有限集合
│   │   │   │   ├── TrainingConfig.ts  # 版本化地形、无人机和武器规则
│   │   │   │   ├── TrainingConfigId.ts  # 玩法配置的独立 UUID 类型
│   │   │   │   ├── TrainingRun.ts  # 冻结账号、规则、地形和状态的局次
│   │   │   │   └── WeaponConfig.ts  # 射击间隔、弹速和射程
│   │   │   └── worlds/
│   │   │       ├── MapDraft.ts  # 带可变修订号的本人地图草稿
│   │   │       ├── MapId.ts  # 地图作品 UUID 品牌，区别于版本身份
│   │   │       ├── MapListResponse.ts  # 本人作品分页结果及内置模板
│   │   │       ├── MapSummary.ts  # 作品列表的修订号与最新版本概览
│   │   │       ├── MapValidationIssue.ts  # 地图错误码、说明及可定位实体编号
│   │   │       ├── MapVersion.ts  # 带稳定 UUID 的不可变世界版本
│   │   │       ├── MapVersionId.ts  # 冻结地图版本 UUID 品牌
│   │   │       ├── validateWorld.ts  # 编辑器共享的几何预算与两阶段路线诊断
│   │   │       ├── WorldBounds.ts  # 可玩地图半径与范围约束
│   │   │       ├── WorldDefinition.ts  # 渲染、碰撞、任务和回放共同读取的世界定义
│   │   │       ├── WorldDrone.ts  # 稳定无人机编号、出生朝向和巡逻点
│   │   │       ├── WorldEntityId.ts  # 稳定实体标识及运行时保留前缀校验
│   │   │       ├── WorldMarker.ts  # 信标或撤离点位置与交互半径
│   │   │       ├── WorldObject.ts  # 箱桶、墙门的稳定编号、位置和尺寸
│   │   │       ├── WorldPoint.ts  # 世界平面 x/z 坐标
│   │   │       └── WorldSpawn.ts  # 角色或无人机出生坐标和朝向
│   │   ├── pages/
│   │   │   ├── Academy/
│   │   │   │   ├── functions/
│   │   │   │   │   └── parseLessonSelection.ts  # 验证课堂 URL 的课程与工具选择
│   │   │   │   ├── hooks/
│   │   │   │   │   └── useAcademy.ts  # 准备、开始、退出和重开本地真实机制课堂
│   │   │   │   ├── objects/
│   │   │   │   │   ├── ActiveLesson.ts  # 当前课堂的配置、世界与生命周期身份
│   │   │   │   │   └── LessonSelection.ts  # 课堂种类和工具选择
│   │   │   │   └── index.tsx  # 三节可操作的 30 秒机制课堂页面
│   │   │   ├── Auth/
│   │   │   │   ├── functions/
│   │   │   │   │   ├── AuthRequest.ts  # 从表单得到可发送的认证请求
│   │   │   │   │   └── validateAuthDraft.ts  # 账号、昵称、确认密码等纯前端校验
│   │   │   │   ├── objects/
│   │   │   │   │   ├── AuthDraft.ts  # 仅前端的认证表单草稿
│   │   │   │   │   ├── AuthErrors.ts  # 认证表单的逐字段错误
│   │   │   │   │   └── AuthFormState.ts  # 认证表单模式和提交状态
│   │   │   │   ├── AuthModal.tsx  # 登录注册弹窗、表单和动作接续
│   │   │   │   └── index.tsx  # 认证弹窗对外入口
│   │   │   ├── History/
│   │   │   │   ├── components/
│   │   │   │   │   ├── Comparison.tsx  # 比较相同任务地图规则的两局数据
│   │   │   │   │   └── ResultRow.tsx  # 历史列表的一局成绩与详情入口
│   │   │   │   ├── functions/
│   │   │   │   │   └── archive.ts  # 档案比较资格、任务标题与本机收藏解码
│   │   │   │   ├── hooks/
│   │   │   │   │   ├── useFavorites.ts  # 按账号隔离的本机收藏读写与失败提示
│   │   │   │   │   └── useHistory.ts  # 查询个人历史、分页和最佳成绩
│   │   │   │   ├── objects/
│   │   │   │   │   ├── BestState.ts  # 个人最佳的加载、结果与失败状态
│   │   │   │   │   ├── HistoryState.ts  # 历史页加载、空、就绪与失败状态
│   │   │   │   │   └── MoreState.ts  # 历史分页的加载更多状态
│   │   │   │   └── index.tsx  # 组合个人历史、分页与最佳成绩
│   │   │   ├── Home/
│   │   │   │   └── index.tsx  # 首页主视觉、行动、练习和成绩入口
│   │   │   ├── Loadout/
│   │   │   │   ├── components/
│   │   │   │   │   └── ToolCard.tsx  # 可选一次性工具的说明卡片
│   │   │   │   ├── functions/
│   │   │   │   │   ├── selection.ts  # 从地址参数解码任务和地图版本选择
│   │   │   │   │   └── toolDescriptions.ts  # 三种工具及不携带选项的用户说明
│   │   │   │   ├── hooks/
│   │   │   │   │   └── useLoadout.ts  # 加载任务与可读取的冻结地图并协调准备状态
│   │   │   │   ├── objects/
│   │   │   │   │   ├── LoadoutLocation.ts  # 出发准备页的地址选择状态
│   │   │   │   │   ├── LoadoutState.ts  # 出发准备的加载、就绪与错误状态
│   │   │   │   │   └── ToolDescription.ts  # 工具卡片所需的展示数据
│   │   │   │   ├── tests/
│   │   │   │   └── index.tsx  # 任务地图与工具出发准备页面
│   │   │   ├── MapEditor/
│   │   │   │   ├── components/
│   │   │   │   │   └── WorldCanvas.tsx  # 支持点选放置与拖动的 SVG 世界俯视图
│   │   │   │   ├── functions/
│   │   │   │   │   ├── editorHistory.ts  # 地图编辑撤销与重做的不可变历史栈
│   │   │   │   │   └── editWorld.ts  # 纯数据编辑、实体复制删除和边界吸附
│   │   │   │   ├── hooks/
│   │   │   │   │   └── useMapDraft.ts  # 草稿加载、保存冲突、版本冻结与试玩协调
│   │   │   │   └── index.tsx  # 地图编辑、诊断、保存、冻结与真实试玩页面
│   │   │   ├── Missions/
│   │   │   │   ├── components/
│   │   │   │   │   ├── MissionCard.tsx  # 任务目标、地图和入口卡片
│   │   │   │   │   └── WorldPreview.tsx  # 无需 WebGL 的真实世界布局缩略图
│   │   │   │   ├── hooks/
│   │   │   │   │   └── useMissions.ts  # 读取公共任务目录并处理加载和失败
│   │   │   │   ├── objects/
│   │   │   │   │   └── MissionsState.ts  # 任务目录加载结果的有限状态
│   │   │   │   └── index.tsx  # 清场和信标撤离的任务目录页面
│   │   │   ├── Replay/
│   │   │   │   ├── index.tsx  # 只读录像播放器、时间轴和关键事件页面
│   │   │   │   ├── mountReplay.ts  # 加载冻结世界并只读播放真实实体与镜头
│   │   │   │   └── player.ts  # 回放插值、事件跳转和离散状态边界
│   │   │   ├── Result/
│   │   │   │   ├── components/
│   │   │   │   │   ├── EventReport.tsx  # 按真实事件呈现关键转折与回看片段入口
│   │   │   │   │   └── ResultSummary.tsx  # 胜负、命中率、用时与保存信息
│   │   │   │   ├── hooks/
│   │   │   │   │   └── useResult.ts  # 读取并恢复本人单局详情
│   │   │   │   ├── objects/
│   │   │   │   │   └── ResultPageState.ts  # 单局详情的加载、就绪、空和失败状态
│   │   │   │   ├── utils/
│   │   │   │   │   └── formatResult.ts  # 成绩用时、零发命中率和日期的展示函数
│   │   │   │   └── index.tsx  # 组合可刷新查询的单局详情
│   │   │   ├── Training/
│   │   │   │   ├── components/
│   │   │   │   │   ├── GameView.tsx  # React 画布挂载、配置传入与终局回调桥
│   │   │   │   │   └── TerrainControls.tsx  # 正式开局前调整允许范围内的地形
│   │   │   │   ├── data/
│   │   │   │   │   └── practice-config.json  # 游客练习的离线规则快照，与后端初始配置测试对齐
│   │   │   │   ├── functions/
│   │   │   │   │   ├── practiceConfig.ts  # 运行时解码游客练习的随包规则
│   │   │   │   │   └── trainingRequest.ts  # 校验行动地址并解析任务、地图或原配置重试
│   │   │   │   ├── game/
│   │   │   │   │   ├── core/
│   │   │   │   │   │   ├── assets.ts  # 加载 GLB、检查动画节点并建立资源类型
│   │   │   │   │   │   ├── cameraObstruction.ts  # 相机与地形、箱体的遮挡检测
│   │   │   │   │   │   ├── challenge.ts  # 倒数、有效时间、胜负与终局去重
│   │   │   │   │   │   ├── controller.ts  # 键鼠输入、平滑瞄准、蓝框转向与镜头缩放
│   │   │   │   │   │   ├── defaultRules.ts  # 原型默认玩法参数，与正式契约保持对应
│   │   │   │   │   │   ├── droneBrain.ts  # 扫描、受击搜索、锁定、血量与击毁逻辑
│   │   │   │   │   │   ├── droneEncounter.ts  # 组合四机 AI、视线、移动、命中与接触
│   │   │   │   │   │   ├── droneMotion.ts  # 巡逻、追击、避障及连续接触计算
│   │   │   │   │   │   ├── droneVisuals.ts  # 红色扫描区、三格血条与警戒外观
│   │   │   │   │   │   ├── explosion.ts  # 无人机接触爆炸的火光、冲击环与粒子
│   │   │   │   │   │   ├── gardenDetails.ts  # 花谷近景路径和装饰细节
│   │   │   │   │   │   ├── lesson.ts  # 30 秒机制课堂的场景和真实完成条件
│   │   │   │   │   │   ├── meadowBackdrop.ts  # 天空、远山与场景大背景
│   │   │   │   │   │   ├── missionProgress.ts  # 清场、信标激活和撤离目标的状态推进
│   │   │   │   │   │   ├── movement.ts  # 角色地形运动、跳跃与箱体落脚碰撞
│   │   │   │   │   │   ├── natureEnvironment.ts  # 植被实例、距离分级、淡出与遮挡处理
│   │   │   │   │   │   ├── natureLod.ts  # 读取和选择离线简化植被网格
│   │   │   │   │   │   ├── obstacles.ts  # 统一箱桶等可阻挡几何定义
│   │   │   │   │   │   ├── props.ts  # 可选道具原型及状态更新
│   │   │   │   │   │   ├── scene.ts  # 组装场景、角色、灯光、模型与对象引用
│   │   │   │   │   │   ├── shooting.ts  # 脉冲弹池、枪口闪光与命中反馈
│   │   │   │   │   │   ├── shootingMath.ts  # 连续弹道、准星与首个碰撞点计算
│   │   │   │   │   │   ├── tacticalTools.ts  # 一次工具、视线干扰、诱饵与碰撞约束推离
│   │   │   │   │   │   ├── terrain.ts  # 共享高度函数、地形网格与山地边界
│   │   │   │   │   │   ├── terrainEditor.ts  # 原型地形参数编辑与重置
│   │   │   │   │   │   ├── toolVisuals.ts  # 干扰幕、诱饵与脉冲的可见效果
│   │   │   │   │   │   ├── touchControls.ts  # 手机移动、瞄准、射击与跳跃输入
│   │   │   │   │   │   ├── worldLayout.ts  # 场景尺寸、出生点及静态物件布局
│   │   │   │   │   │   └── worldRuntime.ts  # 同一世界实体的显示、碰撞、视线与门状态
│   │   │   │   │   ├── recording/
│   │   │   │   │   │   └── createReplayRecorder.ts  # 观察真实状态与事件并按时间和字节预算保留录像
│   │   │   │   │   ├── audio.ts  # Web Audio 合成射击、命中、倒数与爆炸音效
│   │   │   │   │   ├── game.css  # 游戏画布、HUD、触屏控件与特效所需样式
│   │   │   │   │   ├── mountGame.ts  # 挂载和销毁正式 Three.js 行动生命周期
│   │   │   │   │   ├── resources.ts  # 去重释放几何、纹理、材质、骨架和 GPU 资源
│   │   │   │   │   └── roundCompletion.ts  # 冻结终局，等待爆炸可视反馈后仅交付一次结果
│   │   │   │   ├── hooks/
│   │   │   │   │   └── useTraining.ts  # 取得规则、建局、冻结终局并协调保存
│   │   │   │   ├── objects/
│   │   │   │   │   ├── ActiveTraining.ts  # 正式局次或练习的冻结配置、账号与挂载键
│   │   │   │   │   └── Preparation.ts  # 行动准备的加载、错误和可调地形状态
│   │   │   │   └── index.tsx  # 组合地形准备、行动画布与胜负保存面板
│   │   │   └── Workshop/
│   │   │       └── index.tsx  # 本人地图草稿与内置模板入口页面
│   │   ├── system/
│   │   │   ├── api/
│   │   │   │   ├── ApiError.ts  # 携带状态码与业务码的前端异常
│   │   │   │   ├── ApiFailure.ts  # 可识别的 API 失败分类
│   │   │   │   ├── APIMessage.ts  # 泛型消息基类，约束输入序列化与返回类型
│   │   │   │   ├── apiNameOf.ts  # 按调用类名统一推导后端路由
│   │   │   │   ├── apiRequest.ts  # 发送 HTTP 并区分网络、状态码和解码失败
│   │   │   │   ├── APIWithTokenMessage.ts  # 需要可信身份的消息类别
│   │   │   │   ├── decode.ts  # unknown 的对象、数字、枚举、UUID 等运行时校验
│   │   │   │   ├── DecodeError.ts  # 携带字段路径的运行时解码失败
│   │   │   │   ├── NoRequestMessage.ts  # 无业务请求字段的消息类别
│   │   │   │   ├── sendAPI.ts  # 连接消息名称、令牌、请求体和响应解码
│   │   │   │   ├── SendOptions.ts  # 单次请求的 token 与 AbortSignal 参数
│   │   │   │   ├── ServerErrorCode.ts  # 服务器错误码的前端有限集合
│   │   │   │   ├── sessionToken.ts  # 本标签页令牌的读取、写入与清除
│   │   │   │   └── TokenStorage.ts  # 可替换的令牌存储接口
│   │   │   ├── replays/
│   │   │   │   ├── IndexedDBReplayStorage.ts  # 按账号和局次持久化大型回放与摘要
│   │   │   │   ├── ReplayQueue.ts  # 成绩之后独立补传摘要及录像并管理重试
│   │   │   │   ├── ReplayQueueDependencies.ts  # 回放队列的持久化和网络依赖边界
│   │   │   │   ├── ReplayQueueItemStatus.ts  # 一局摘要和回放各自的上传状态
│   │   │   │   ├── ReplayQueueSnapshot.ts  # 供界面订阅的不可变回放队列状态
│   │   │   │   ├── ReplaysContextValue.ts  # React 回放存储与上传操作接口
│   │   │   │   ├── ReplaysProvider.tsx  # 绑定账号、联网重试和 IndexedDB 生命周期
│   │   │   │   ├── ReplayStorage.ts  # 可替换的回放持久化接口
│   │   │   │   ├── replayStorageCodec.ts  # 从本机 unknown 数据校验回放归属和字段
│   │   │   │   ├── ReplayUploadState.ts  # 等待、上传、成功及失败的有限状态
│   │   │   │   └── StoredReplay.ts  # 带账号归属与待传状态的本机过程记录
│   │   │   ├── results/
│   │   │   │   ├── PendingQueueSnapshot.ts  # 待保存队列的不可变快照
│   │   │   │   ├── PendingResultItem.ts  # 绑定原账号、局次和冻结成绩的队列项
│   │   │   │   ├── PendingResultQueue.ts  # 按账号与 RunId 管理持久化结果重试
│   │   │   │   ├── PendingResultsContextValue.ts  # React 成绩队列的公开接口
│   │   │   │   ├── PendingResultsProvider.tsx  # 将队列、当前会话和 React 保存状态连接
│   │   │   │   ├── PendingSaveState.ts  # 保存中、已保存、失败等显示状态
│   │   │   │   ├── QueueStorage.ts  # 持久化待保存队列的存储接口
│   │   │   │   ├── ResultOwnerSession.ts  # 允许提交某玩家结果的会话身份
│   │   │   │   ├── SaveAttempt.ts  # 单次保存尝试的结果类型
│   │   │   │   ├── SaveFailure.ts  # 保存失败的可重试和身份错误类型
│   │   │   │   └── SubmissionSaver.ts  # 发送冻结终局并返回已保存成绩的接口
│   │   │   ├── session/
│   │   │   │   ├── PlayerSessionState.ts  # 身份检查、登录、退出和不可达的有限状态
│   │   │   │   ├── SessionContextValue.ts  # React 会话上下文的公开操作类型
│   │   │   │   ├── SessionController.ts  # 认证恢复、退出与旧请求竞态隔离
│   │   │   │   ├── SessionDependencies.ts  # 会话控制器的可注入网络与存储依赖
│   │   │   │   └── SessionProvider.tsx  # 把会话控制器接入 React 订阅与操作
│   │   │   └── settings/
│   │   │       ├── GameSettings.ts  # 本机画质、音量和镜头灵敏度及严格解码
│   │   │       ├── SettingsModal.tsx  # 调整本机画质、音量和镜头速度
│   │   │       └── useGameSettings.ts  # 读取、持久化并更新本机设置
│   │   ├── App.tsx  # 组合导航、认证弹窗、设置与页面路由
│   │   ├── index.css  # Tailwind 入口、主题与基础全局样式
│   │   ├── main.tsx  # 挂载 React、浏览器路由和全局 Provider
│   │   └── router.tsx  # 首页、行动、成绩路由和账号访问门槛
│   ├── tests/
│   │   ├── fixtures/
│   │   │   ├── contract.json  # 与后端一致的合法契约测试样本
│   │   │   └── expansion-production.mjs  # 新 API 在实际生产包中的类型响应与请求验证数据
│   │   ├── academySelection.test.ts  # 课堂参数与离线选择边界测试
│   │   ├── api.test.ts  # 请求名称、状态码与解码边界测试
│   │   ├── archive.test.ts  # 同条件比较与本机收藏边界测试
│   │   ├── contracts.test.ts  # DTO 字段、枚举、UUID 和非法输入测试
│   │   ├── game-completion.test.ts  # 终局冻结、爆炸延迟、回调去重与卸载取消测试
│   │   ├── game-resources.test.ts  # 卸载时几何、材质、贴图和骨架去重释放测试
│   │   ├── identity.typecheck.ts  # 不同品牌 ID 不可混用的编译负例
│   │   ├── loadoutSelection.test.ts  # 任务地图工具 URL 的严格解码测试
│   │   ├── mission-progress.test.ts  # 不同任务胜负、激活和门状态测试
│   │   ├── pendingQueue.test.ts  # 账号隔离、重复保存和失败重试测试
│   │   ├── practiceConfig.test.ts  # 游客离线配置与后端初始规则一致性测试
│   │   ├── replay-player.test.ts  # 只读回放插值、事件跳转和拖动边界测试
│   │   ├── replay-queue.test.ts  # 回放归属、存储失败及独立补传测试
│   │   ├── replay-recording.test.ts  # 真实采样、事件顺序、哈希与裁剪预算测试
│   │   ├── session.test.ts  # 会话恢复、注销和旧请求竞态测试
│   │   ├── sessionToken.test.ts  # 会话令牌存储与损坏值处理测试
│   │   ├── settings.test.ts  # 本机设置范围与非法值解码测试
│   │   ├── tactical-tools.test.ts  # 干扰视线、诱饵和脉冲碰撞行为测试
│   │   ├── world-runtime.test.ts  # 统一世界布局、掩体、门与运行时状态测试
│   │   ├── worldContracts.test.ts  # 共享模板、冻结契约和旧 DTO 兼容测试
│   │   ├── worldEditor.test.ts  # 地图编辑操作与几何诊断测试
│   │   └── worldIdentity.typecheck.ts  # 编译期证明作品、版本和任务 ID 不可混用
│   ├── index.html  # 浏览器入口和应用挂载点
│   ├── package-lock.json  # 锁定 npm 依赖版本
│   ├── package.json  # 依赖以及开发、测试和构建命令
│   ├── postcss.config.mjs  # 加载 Tailwind CSS 的 PostCSS 插件
│   ├── tsconfig.json  # TypeScript 严格检查配置
│   └── vite.config.ts  # Vite 开发、构建与路径配置
├── scripts/
│   ├── invoke-backend.ps1  # 统一调用 sbt 与项目 Java/缓存
│   ├── README.md  # 本目录架构、运行方式与实现说明
│   ├── runtime-common.ps1  # 脚本共享的路径、配置和进程辅助
│   ├── sbt-repositories  # sbt 使用的官方 Maven 仓库列表
│   ├── setup-java.ps1  # 准备并校验项目 Java 工具链
│   ├── start-app.ps1  # 按顺序启动项目数据库、API 和正式前端
│   ├── start-backend.ps1  # 读取本机配置并启动 Scala API
│   ├── start-database.ps1  # 初始化并启动隔离的项目 PostgreSQL
│   ├── stop-app.ps1  # 停止本项目应用进程并保留数据库数据
│   ├── stop-backend.ps1  # 停止本项目 API 进程
│   ├── stop-database.ps1  # 只停止项目数据库并保留数据
│   ├── test-backend.ps1  # 使用隔离数据库运行后端测试
│   └── verify-expansion.mjs  # 实际 API 的任务、地图版本和归属联调脚本
├── shared/
│   ├── missions/
│   │   ├── clear-drones.json  # 清场任务的版本、默认地图和工具选项
│   │   └── forest-beacon.json  # 信标撤离任务的目标与可选工具
│   └── worlds/
│       ├── forest-crossroads.json  # 具有庭院隔断与四架巡逻无人机的内置世界
│       ├── garden-courtyard.json  # 三分区、左右入口和捷径门的内置庭院
│       └── templates.json  # 两个内置世界的冻结版本与元数据
├── threejs/
│   ├── docs/
│   │   ├── preview-before-style.png  # 浏览器或素材实际截图：before-style
│   │   ├── preview-character-refresh.png  # 浏览器或素材实际截图：character-refresh
│   │   ├── preview-controls.png  # 浏览器或素材实际截图：controls
│   │   ├── preview-countdown-fixed.png  # 浏览器或素材实际截图：countdown-fixed
│   │   ├── preview-crate-jump.png  # 浏览器或素材实际截图：crate-jump
│   │   ├── preview-drone-defeat.png  # 浏览器或素材实际截图：drone-defeat
│   │   ├── preview-drone-hunt.png  # 浏览器或素材实际截图：drone-hunt
│   │   ├── preview-drone-victory.png  # 浏览器或素材实际截图：drone-victory
│   │   ├── preview-fantasy-crate.png  # 浏览器或素材实际截图：fantasy-crate
│   │   ├── preview-game.png  # 浏览器或素材实际截图：game
│   │   ├── preview-lod.png  # 浏览器或素材实际截图：lod
│   │   ├── preview-megakit.png  # 浏览器或素材实际截图：megakit
│   │   ├── preview-mobile.png  # 浏览器或素材实际截图：mobile
│   │   ├── preview-open-valley.png  # 浏览器或素材实际截图：open-valley
│   │   ├── preview-render-refresh.png  # 浏览器或素材实际截图：render-refresh
│   │   ├── preview-tree-occlusion.png  # 浏览器或素材实际截图：tree-occlusion
│   │   ├── preview-valley-camp.png  # 浏览器或素材实际截图：valley-camp
│   │   ├── preview-valley.png  # 浏览器或素材实际截图：valley
│   │   ├── preview.png  # 浏览器或素材实际截图：preview
│   │   └── PROP_DESIGN.md  # 道具与场景变化的候选设计
│   ├── public/
│   │   └── assets/
│   │       ├── arena/
│   │       │   ├── eye-drone.glb  # 运行用无人机模型与动作
│   │       │   ├── License_Fantasy_Standard.txt  # 箱桶素材原始许可
│   │       │   ├── License_SciFi_Standard.txt  # 无人机素材原始许可
│   │       │   ├── manifest.json  # 所属素材集合的来源、节点与尺寸清单
│   │       │   └── props.glb  # 运行用 Fantasy 箱桶素材集合
│   │       ├── models/
│   │       │   ├── asset-info.json  # 本地生成 GLB 的尺寸、节点和动画清单
│   │       │   ├── bubble-gun.glb  # 紧凑脉冲枪，沿用旧文件名，含 muzzle
│   │       │   ├── bush.glb  # 历史程序灌木原型
│   │       │   ├── crate.glb  # 历史程序木箱原型
│   │       │   ├── nailong.glb  # 本地梨形角色，含四段动画和挂枪节点
│   │       │   ├── rock.glb  # 历史程序岩石原型
│   │       │   ├── target.glb  # 历史圆靶原型，保留素材实验使用
│   │       │   ├── tree.glb  # 历史程序树原型
│   │       │   └── wall-segment.glb  # 历史程序矮墙段原型
│   │       └── nature/
│   │           ├── License_Standard.txt  # 自然素材 Standard 原始许可
│   │           ├── manifest.json  # 所属素材集合的来源、节点与尺寸清单
│   │           ├── megakit-lod.json  # 植被离线 LOD 网格数据
│   │           └── megakit.glb  # 精选自然植被和岩石模型集合
│   ├── scripts/
│   │   ├── create-pulse-blaster.mjs  # 生成奶白与深青紧凑脉冲枪模型
│   │   ├── download-asset-packs.mjs  # 下载选用素材包并校验归档
│   │   ├── generate-assets.mjs  # 生成并验证本地角色和原型 GLB
│   │   ├── inspect-asset-packs.mjs  # 检查素材包模型、动画与贴图
│   │   ├── prepare-arena-assets.mjs  # 整理箱桶和无人机为运行用 GLB
│   │   ├── prepare-megakit.mjs  # 从 MegaKit 整理精选自然模型
│   │   └── prepare-nature-lod.mjs  # 离线生成植被简化网格级别
│   ├── src/
│   │   ├── game/
│   │   │   ├── assets.ts  # 重导出正式核心：加载 GLB、检查动画节点并建立资源类型
│   │   │   ├── cameraObstruction.ts  # 重导出正式核心：相机与地形、箱体的遮挡检测
│   │   │   ├── challenge.ts  # 重导出正式核心：倒数、有效时间、胜负与终局去重
│   │   │   ├── controller.ts  # 重导出正式核心：键鼠输入、平滑瞄准、蓝框转向与镜头缩放
│   │   │   ├── defaultRules.ts  # 重导出正式核心：原型默认玩法参数，与正式契约保持对应
│   │   │   ├── droneBrain.ts  # 重导出正式核心：扫描、受击搜索、锁定、血量与击毁逻辑
│   │   │   ├── droneEncounter.ts  # 重导出正式核心：组合四机 AI、视线、移动、命中与接触
│   │   │   ├── droneMotion.ts  # 重导出正式核心：巡逻、追击、避障及连续接触计算
│   │   │   ├── droneVisuals.ts  # 重导出正式核心：红色扫描区、三格血条与警戒外观
│   │   │   ├── explosion.ts  # 重导出正式核心：无人机接触爆炸的火光、冲击环与粒子
│   │   │   ├── gardenDetails.ts  # 重导出正式核心：花谷近景路径和装饰细节
│   │   │   ├── meadowBackdrop.ts  # 重导出正式核心：天空、远山与场景大背景
│   │   │   ├── movement.ts  # 重导出正式核心：角色地形运动、跳跃与箱体落脚碰撞
│   │   │   ├── natureEnvironment.ts  # 重导出正式核心：植被实例、距离分级、淡出与遮挡处理
│   │   │   ├── natureLod.ts  # 重导出正式核心：读取和选择离线简化植被网格
│   │   │   ├── obstacles.ts  # 重导出正式核心：统一箱桶等可阻挡几何定义
│   │   │   ├── props.ts  # 重导出正式核心：可选道具原型及状态更新
│   │   │   ├── scene.ts  # 重导出正式核心：组装场景、角色、灯光、模型与对象引用
│   │   │   ├── shooting.ts  # 重导出正式核心：脉冲弹池、枪口闪光与命中反馈
│   │   │   ├── shootingMath.ts  # 重导出正式核心：连续弹道、准星与首个碰撞点计算
│   │   │   ├── terrain.ts  # 重导出正式核心：共享高度函数、地形网格与山地边界
│   │   │   ├── terrainEditor.ts  # 重导出正式核心：原型地形参数编辑与重置
│   │   │   ├── touchControls.ts  # 重导出正式核心：手机移动、瞄准、射击与跳跃输入
│   │   │   └── worldLayout.ts  # 重导出正式核心：场景尺寸、出生点及静态物件布局
│   │   ├── main.ts  # 独立原型的启动、界面、输入与游戏循环
│   │   └── style.css  # 独立原型的菜单、画布与 HUD 样式
│   ├── tests/
│   │   ├── camera.test.ts  # 相机避障、跟随与瞄准测试
│   │   ├── challenge.test.ts  # 倒数、四机全清、失败终局和重开测试
│   │   ├── config-rules.test.ts  # 共享核心默认参数与正式配置规则一致性测试
│   │   ├── droneBrain.test.ts  # 扫描角度、受击搜索与视线测试
│   │   ├── droneMotion.test.ts  # 巡逻、追击、避障与连续接触测试
│   │   ├── droneTakeoff.test.ts  # 多帧率起飞、保护期、可见受击追击与遮挡搜索测试
│   │   ├── explosion.test.ts  # 爆炸时间、状态与清理测试
│   │   ├── movement.test.ts  # 移动、跳跃、坡地和箱体落地测试
│   │   ├── shooting.test.ts  # 连续弹道、遮挡与命中测试
│   │   └── terrain.test.ts  # 高度、环山边界与网格预算测试
│   ├── .gitignore  # 排除依赖、产物、工具缓存和本机凭据
│   ├── ASSET_CREDITS.md  # 实际素材来源、作者、许可与修改记录
│   ├── index.html  # 浏览器入口和应用挂载点
│   ├── package-lock.json  # 锁定 npm 依赖版本
│   ├── package.json  # 依赖以及开发、测试和构建命令
│   ├── README.md  # 本目录架构、运行方式与实现说明
│   ├── tsconfig.json  # TypeScript 严格检查配置
│   └── vite.config.ts  # Vite 开发、构建与路径配置
├── .env.example  # 本机数据库与 API 环境变量模板，不含真实密码
├── .gitignore  # 排除依赖、产物、工具缓存和本机凭据
├── README.md  # 本目录架构、运行方式与实现说明
└── 类型安全 10.29.pdf  # 课程类型安全、IO、前后端边界与模块化笔记
```
<!-- FILE_TREE_END -->


参考资料与应用源码分开：sample/ 是课程前后端示例，experience/ 是早期多人体验概念，singleplayer-experience/ 是早期单人图册；历史资料不在应用树逐项展开，也不是额外三套成品页面。sample 的目录与类型边界用于参考，旧样例的裸 JSON 强转没有照搬。

## 当前实现与验收边界

这是单人前端战场：营地 → 选任务与工具 → 行动 → 报告 → 真实回放 → 再试或改地图。注册登录、正式局次、成绩、过程数据与个人地图存入 Scala + PostgreSQL；游客练习和三节课堂不依赖账号成绩。

仓库为 [zhuyf25t/nailong](https://github.com/zhuyf25t/nailong)。[49671c5](https://github.com/zhuyf25t/nailong/commit/49671c5af4bef8de1579aaecdd10f50e4af248b0) 是此前四机清场的已推送基线，不代表本轮新增代码已经提交或推送。当前规则版本仍为 **drone-hunt-v2**，地图、任务和回放格式各有自己的版本。

**自动化检查已通过；浏览器已验证正式败局→报告→真实回放，以及地图编辑→保存→冻结→试玩载入，具体范围见 [IMPLEMENTATION_QA.md](docs/IMPLEMENTATION_QA.md)。** 真实胜利路线、断网恢复、五位新玩家各玩两局的反馈、真实手机上的加载/帧率/触控检查尚待执行；编辑器窄屏无横溢的检查不能替代真实设备。

| 已落盘模块 | 实际范围 | 明确边界 |
|---|---|---|
| 账号与正式行动 | 按需登录、冻结规则/地图/工具、本人保存与补传 | 浏览器客户端计算，不是服务端权威反作弊 |
| 两种任务 | 四机清场；启动信标后回营撤离 | 单人，无房间、匹配、WebSocket |
| 三种一次性工具 | 干扰幕、诱饵、排斥脉冲，也可不带工具 | 每局只用一次；普通子弹不打断已锁定追击 |
| 档案与回放 | 真实事件、状态采集、事件跳转、末尾片段、两局比较 | 收藏仅本机；轨迹与粒子不承诺像素级还原 |
| 地图工坊 | 两模板、个人草稿、校验、试玩、冻结版本 | 受限物件与参数编辑，没有公开社区或素材市场 |
| 三节课堂 | 30 秒信标、脱锁、工具实际生效练习 | 不创建正式 RunId，不保存账号成绩 |

## 后端：按服务阅读

源码在 backend/src/main/scala/services/。player / training / records / worlds 是有边界的服务模块，目前运行在同一个 Scala HTTP 进程和 PostgreSQL 中，并未部署成多个网络服务。模块保留 sample 的 api / objects / routes / tables / utils；系统公共设施集中于 system。共 24 个业务 API，精确请求、响应、限制见 [API_CONTRACT.md](docs/API_CONTRACT.md)。

### player：账号与会话

- **api**：RegisterPlayer、LoginPlayer、GetCurrentPlayer、LogoutPlayer；内部 ResolvePlayerToken 仅供基础设施调用。
- **objects**：PlayerId、SessionId、SessionToken 是不同身份类型；PlayerProfile 是公开资料；StoredPlayer / StoredSession 包含哈希、令牌摘要等内部数据；AuthResponse 返回资料、令牌与到期时间。
- **routes**：PlayerRoutes 声明公开与需令牌消息，统一 Router 注入可信身份。
- **tables**：players / player_sessions 各有 Table 与 Initializer，封装唯一用户名、会话期限、撤销及公开 IO 方法。
- **utils**：PlayerValidation 校验输入；PlayerSecrets 加盐 PBKDF2-HMAC-SHA256 和令牌摘要；PlayerSession 组合会话创建。密码哈希不进入前端 DTO。

### training：规则与冻结局次

- **api**：GetTrainingConfig、StartTrainingRun、GetTrainingRun、AbandonTrainingRun。Start 可带 RunSelection；省略时兼容旧四机模式。
- **objects**：TrainingConfig / DroneRules / WeaponConfig / TerrainConfig 是可解码参数；TrainingRun 保存身份、状态与快照；RunSelection 是任务/地图版本/工具请求；RunSetup 冻结 MissionDefinition、WorldDefinition、MapVersionId、Loadout、seed 和素材版本。
- **routes**：TrainingRoutes 注册四个消息，只有读取公共配置无需登录。
- **tables**：training_configs 保存不可覆盖的规则版本；training_runs 保存开始、放弃、完成状态及 setup_json / selection_json。每表一个 Table 和 Initializer。
- **utils**：ValidateTerrain 校验地形；TrainingConfigResource 读取内置规则；ValidateRunSelection 解析可读世界并校验选择，通过 worlds 公开消息/表能力获取数据，不跨服务直接调用私有 utils。

Start 在服务器解析任务与本人/内置地图版本，要求 terrain 与该世界一致，同步 config 快照的地形与无人机出生点。当前账号、RunId、世界、工具和规则在开始时冻结。相同 (playerId,requestId) 与输入重试返回同一局；改变 selection 或版本则冲突，新一局使用新 requestId。

### records：成绩、事件与回放

- **api**：SaveTrainingResult、GetTrainingResult、ListMyResults、GetMyBest，以及 Save/GetRunEvents、Save/GetRunReplay，共八个消息。
- **objects**：ResultSubmission / ObjectiveProgress 区分清场与撤离进度；TrainingResult 保留 setup；RunEventSummary 记录真实事件；ReplayManifest / Frame / Coverage / Envelope 记录冻结场景、状态帧、覆盖区间与原文哈希；各角色/无人机/弹丸/工具/镜头状态分别建类型。
- **routes**：RecordsRoutes 注册本人操作，为事件与回放上传单独分配有界请求体预算。
- **tables**：training_results、run_event_summaries、run_replays，分别持久化成绩、摘要与原始回放内容，各有 Table 与 Initializer。
- **utils**：ResultValidation 校验血量/射速/任务胜负与幂等；RecordingAccess 校验本人和已完成成绩；RecordingValidation / RecordingCodecs 核对冻结配置、对象引用、事件顺序、终局与哈希。

Save 锁定同一 run 行，在一笔事务内插入成绩并完成局次；与放弃竞争时只有一个合法状态。清场胜利要求全毁；撤离胜利要求已激活并撤离，允许仍有无人机存活。接触自爆会在录像里呈现敌机摧毁，但不算玩家击毁数。

GetMyBest 保留旧接口，只查询 setup=null 的标准清场成绩；新任务两局比较在前端要求任务、地图版本、规则、地形、工具一致。不能将不同目标混为同一个最佳成绩。

### worlds：任务目录与地图版本

- **api**：公开 ListMissions、GetMission；本人 ListMyMaps、GetMapDraft、SaveMapDraft、CloneMap、CreateMapVersion；登录后 GetMapVersion 可读内置或本人版本。
- **objects**：MapId 是作品，MapVersionId 是不可变版本；MapDraft 带可变 revision，MapVersion 带冻结世界；WorldDefinition 包含地形、边界、出生、掩体、巡逻无人机、信标、撤离；MissionObjective 为清场或激活撤离；MapValidationIssue 可定位编辑错误。
- **routes**：WorldsRoutes 注册八个消息；SaveMapDraft 请求上限为 64 KiB，其余普通世界请求为 16 KiB。
- **tables**：实际表是 world_maps、world_map_versions、world_missions。MapDraftTable 保存作品归属及最新草稿，MapVersionTable 保存冻结版本，MissionTable 保存已发布任务；并没有额外空壳 maps 表。
- **utils**：ValidateWorld 检查预算、边界、重叠与两阶段可达性；WorldResources 读取共享资源副本；WorldWireCodecs 做线路解码。WorldInitializer 校验并初始化内置模板与任务。

CloneMap 创建自己的 revision=1 草稿；保存时 expectedRevision 防止覆盖其他标签页的新修改。冻结同修订幂等返回同版本，继续改草稿不改变历史版本。训练与回放消费冻结 WorldDefinition；旧记录不跟随当前编辑。

### system：公共执行边界

Main 是 IOApp 入口；DatabaseSession 用 Hikari Resource 管理连接与事务，成功提交、异常和取消回滚；DatabaseInitializer 按依赖顺序组合十张实际业务表的初始化。SQL 留在每张表自己的模块，不集中到巨大初始化文件。

api/ 定义 APIMessage、APIWithTokenMessage、NoRequestMessage、类型注册、自动名称、JSON 与可信身份边界；routes/ApiRouter 合并服务并提供数据库健康检查；objects/ 放错误码、配置与时间类型。system 无业务表，不为了对称创建空 tables / utils。

## 前端：按同一服务顺序阅读

继续采用 sample 的文件架构：**apis/<服务> 是请求类，objects/<服务> 是领域类型及 decoder，pages/<页面> 是界面；没有把它们搬成后端 services 目录。** 页面草稿、异步状态和交互函数留在相应页面的 objects / hooks / functions / components。

### player 对应模块

apis/player 与 objects/player 映射四个账号 API 和公开响应。system/session 管 checking / signed-out / signed-in / unavailable、请求竞态和标签页 sessionStorage 令牌。Home 先展示游戏；进入正式行动、档案、工坊时才按需打开 Auth 弹窗，成功接续一次原操作。断网和令牌失效分别表达。

### training 对应模块

apis/training 包含规则、局次与公共任务目录请求。后端 MissionDefinition 位于 worlds，前端放 objects/training，便于任务准备使用；线路保持同构。builtinCatalog 从 shared JSON 解码出本地任务与模板，为离线练习提供真实世界，不伪造服务器响应。

Missions 选目标，Loadout 选工具与地图版本，Academy 进入 30 秒机制课堂。Training 冻结本局后懒加载 GameView，GLB 和 shader 就绪后才允许开始；正式行动倒数后计时。React 管菜单、HUD、身份和保存，Three 核心管输入、角色、AI、碰撞、弹道与目标。

pages/Training/game/core/worldRuntime 让同一份世界驱动画面、移动、子弹与视线；开门同步更新阻挡。missionProgress 判断目标；tacticalTools 管一次工具；lesson 判断真实课堂行为。threejs/src/game 继续重导出正式核心，5174 原型不另维护一份 AI。

### records 对应模块

apis/records、objects/records 对应成绩与真实过程。History 支持分页、筛选、本机收藏及同条件两局比较；Result 按 URL 从数据库读取，并展示事件、最后八秒入口、原配置重试和地图复制。

system/results 用 localStorage 按 playerId+runId 独立保存冻结 submission，失败重试不换 runId，换号不代传。system/replays 用 IndexedDB 保存摘要和回放，分别显示上传状态，先确认成绩存在再上传。存储配额失败会显式提示并保留当前内存；当前没有自动淘汰策略，也不默默删除待传记录。

录制器只观察真实运行状态。Replay 页面用独立只读场景播放，不调用 AI、碰撞积分、开局或保存成绩接口。可拖动、选择 0.25×/0.5×/1×/2×、切换原镜头/俯视、显示扫描与路线、跳到事件前两秒；不在录像范围内的事件仅显示摘要。

### worlds 对应模块

apis/worlds / objects/worlds 承接草稿、版本和验证。Workshop 显示两模板与本人草稿，MapEditor 用 SVG 俯视图点选、放置、拖动实体，修改掩体尺寸、地形、出生、无人机巡逻与交互区；错误能定位对象。

编辑器试玩懒加载真实 GameView，使用相同碰撞、工具和无人机；关闭试玩释放资源。保存草稿与冻结版本分开；可导出本机 JSON 备份。工坊不是第三方任意 GLB 发布市场。

### 公共系统与生命周期

system/api 管 HTTP、令牌、API 类名与 unknown 解码；system/settings 管画质/音量/灵敏度；components/ui 提供可访问的基础控件。router 注册下表十个页面，Auth 是弹窗，不重复计页面。离开游戏/回放/编辑器试玩会释放循环、事件、observer、音频与 GPU 资源；任务卡与地图编辑俯视图不常驻额外 WebGL 场景。

## 十个页面与实际操作

| 页面 | 路由 | 主要操作 |
|---|---|---|
| 花谷营地 | / | 进入任务、公开练习、课堂、档案或工坊 |
| 任务地图 | /missions | 比较清场与信标撤离目标，查看布局 |
| 出发准备 | /missions/:missionId/loadout | 选三种工具或不带工具，查看任务条件与当前地图版本 |
| 行动现场 | /training | 移动、瞄准、跳跃、射击、使用工具、激活与撤离 |
| 本局报告 | /results/:runId | 查看持久成绩和真实事件，重试上传、回看、同配置新局 |
| 行动档案 | /history | 分页筛选、本机收藏、选择同条件两局比较 |
| 战术回放 | /replays/:runId | 拖动真实录像、跳事件、看最后八秒、切换观察方式 |
| 训练课堂 | /academy | 30 秒练信标撤离、脱锁或工具实际影响无人机 |
| 我的地图 | /workshop | 浏览模板、复制、继续自己的草稿 |
| 地图编辑器 | /workshop/maps/:mapId/edit | 编辑、定位错误、真实试玩、保存、冻结版本 |

/training?practice=1 是游客练习；mission=forest-beacon 或 clear-drones 选任务，tool=none/curtain/decoy/pulse 选工具，mapVersionId 指定可读取的冻结地图。正式入口需账号；无效参数不会静默换成另一地图。课堂和工坊试玩不创建正式成绩。

## 战场、工具与地图

主模板“花谷旧庭院”半径 24 米，营地出生朝向负 Z，墙体分为营地、庭院、后庭三段；横墙有左右两口与中央捷径门。后庭信标激活后正门打开，回到营地撤离。另一模板“林间交叉口”增加内部隔断；两图各四架巡逻无人机。两侧口在门关闭时可达信标，出生区与四机间有实际墙体遮挡。几何测试不代替真人验证两条打法的难度与趣味。

无人机以约 90°红色扫描范围发现玩家，显示血条；未发现玩家受击时快速搜索，已经看见并锁定时受击继续追击。v2 巡逻 1.1m/s、追击 7.2m/s，起飞从地面上方 0.82m 过渡至 2.2m、历时 1.25s，锁定后俯冲至约 1.2m。断开视线后追到最后目击位置并搜索，不继续知道玩家的新位置。

| 工具 | 实际作用 | 限制 |
|---|---|---|
| 干扰幕 | 半径 3m、高 4m，持续 4 秒，阻断视线 | 不挡身体与子弹；使用后仍需换位 |
| 诱饵信标 | 前方投放，吸引 8m 内可见诱饵的非锁定敌机，持续 5 秒 | 不能抢走仍看见玩家的追击者；不穿掩体投放 |
| 排斥脉冲 | 影响 5m 内敌机，短暂约 0.65 秒停顿并推动约 2.4m | 推动遵守碰撞，不是永久眩晕 |

每局最多使用一次所带工具，也可不携带。Q 使用工具；靠近信标按 E 交互。清场目标必须击毁全部无人机；信标任务允许清场后撤离，也允许保留敌机撤离，正式任务没有 30 秒硬倒计时。

## 真实回放与版本

玩家、全部无人机、活动弹丸、工具、门、信标和镜头均以状态快照记录，射击/命中/锁定/失去视线/工具/激活/终局以带序号事件记录。基础 10Hz，追击与死亡关键段约 30Hz，事件促使追加状态；累计角度避免快速旋转被错误插值。暂停与倒数不计入行动，终局后的爆炸尾段最多 1.2 秒与成绩耗时分开。

完整录像最多 10 分钟或 12000 帧；约 5MiB 软预算触发转为最后 30 秒片段，序列化按真实 UTF-8 字节检查，payload 硬上限 6MiB、HTTP envelope 8MiB；必要时再缩短并标明实际范围。摘要最多 10000 事件、1MiB；前段被裁剪时 truncated=true。片段初帧含完整存活实体与正在飞行弹丸，不编造此前首次锁定。

成绩先保存，摘要与回放分别补传；IndexedDB 队列按账号隔离，登录、online、focus 与定期重试只处理本人记录。SHA-256 验证原始 payloadJson 字节；地图、规则、素材和格式绑定当局快照。旧局缺录像时展示 missing_legacy，未知版本或哈希错误不拿新场景代替。移动插值与简化粒子服务于复盘，不承诺确定性逐帧还原。

## 类型安全与请求链路

~~~text
React 事件 → new StartTrainingRunAPI(...).send()
→ system/api 添加令牌、HTTP 请求、unknown 响应解码
→ Scala Router 验证 JSON 和 token，注入可信身份
→ StartTrainingRunAPIMessage.plan(connection): IO[TrainingRun]
→ 公开 Table 方法绑定参数、执行 SQL、映射类型
→ 外层事务统一提交 / 回滚
→ Circe 编码 DTO → 前端运行时解码 → 页面不可变状态
~~~

一个后端动作一个 case class 消息；无输入用 NoRequestMessage，不增加纯转发 Service 层或万能 Context。公开消息可以组合跨服务公开消息/Table，私有 utils 留在服务内部；每张表各有 Table 与 Initializer。有限状态用 Scala enum 与 TypeScript 联合类型；ID 使用独立品牌/包装类型。

API 名从类名派生，生产构建保留名称并检查实际产物；页面不硬编码 HTTP URL。成功返回明确 DTO，错误为 {code,message}，400/401/403/404/409/500 与有限错误码对应。规则依据[类型安全笔记](<类型安全 10.29.pdf>)与课程 sample；详见 [API 契约](docs/API_CONTRACT.md)。

## 本地启动

从 `nailong/` 目录打开 PowerShell。需要 Node.js、npm，以及 PostgreSQL 二进制；脚本优先复用本机安装，可通过 `NAILONG_PG_BIN` 或 `-PgBin` 指定路径。Java/sbt 安装与数据库隔离细节见[运行脚本说明](scripts/README.md)。

```powershell
# 首次准备 Java 与项目独立数据库；数据库脚本自动生成随机本机密码。
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/setup-java.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/start-database.ps1

# 启动 Scala API；另开终端启动前端。
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/start-backend.ps1
```

```powershell
# 第二个终端，从 nailong/ 执行。
Set-Location ./frontend
npm ci
npm run dev
```

| 地址 / 进程 | 用途 |
|---|---|
| `http://127.0.0.1:5173/` | 正式 React 应用：账号、行动、数据库成绩、设置；Vite 代理 `/api` 到 8080 |
| `http://127.0.0.1:8080/api/health` | Scala API 健康检查；启动时连接真实 PostgreSQL 并初始化表 |
| `127.0.0.1:55432` | 本项目 PostgreSQL 默认端口；首次冲突时脚本在指定范围选空闲端口并写入 `.env` |
| `http://127.0.0.1:5174/` | 独立 `threejs` 原型：直接验证渲染/素材/控制，不是正式账号应用 |
| `http://127.0.0.1:4173/` | `frontend` 生产构建预览；仍需要 API 与数据库运行 |

要启动原型，在 `nailong/threejs/` 执行 `npm ci`、`npm run dev -- --port 5174 --strictPort`。正式应用不需要同时运行 5174；它的游戏模块和素材已放在自己的源码与 `public/` 中。

根目录 `.env.example` 列出 `DB_HOST/PORT/NAME/TEST_NAME/USER/PASSWORD/MAX_POOL_SIZE/CONNECTION_TIMEOUT_MS`、`API_HOST/PORT`。真实 `.env` 由本机脚本生成。数据库数据、日志和管理凭据放在 `.local/`；下载工具与缓存放在 `.tools/`。脚本不修改已有 PostgreSQL 系统服务。依赖准备好后，也可在根目录执行 `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/start-app.ps1` 一次启动数据库、API 和正式前端；用 `stop-app.ps1` 停止该栈。单独停机使用 `stop-backend.ps1` 和 `stop-database.ps1`，均保留项目数据。API 改端口时也要同步前端 Vite 代理目标。

## 素材、渲染与操作

正式离线运行资源在 frontend/public/，原型资源在 threejs/public/；普通运行无需 Blender 或在线下载。角色与脉冲枪为本项目程序建模，并非下载的官方奶龙模型；环境、箱桶和无人机使用 Quaternius Standard CC0 素材，原许可证随资源保留。来源见[正式素材说明](frontend/public/ASSET_CREDITS.md)和[原型素材说明](threejs/ASSET_CREDITS.md)。

角色 GLB 包含 Idle / Walk / Aim / Shoot 与 weapon_socket，枪含 muzzle；动画混合器管理动作，世界位移与碰撞由逻辑管理。地形高度函数同时供网格与移动使用，远山简化轮廓、植被 LOD/实例化/视锥筛选与距离处理控制开销。当前是受限场景，不是商业开放世界流式引擎。

| 操作 | 行为 |
|---|---|
| W / A / S / D | 沿相机地面方向移动 |
| 空格 | 跳跃并可落到箱体 |
| 鼠标移动 | 平滑瞄准，超出中央蓝框后渐进转镜头 |
| 左键按住 | 依射速持续发射 |
| Q / E | 使用一次工具 / 靠近信标交互 |
| 滚轮 / 镜头按钮 | 调整跟随距离 |
| Esc / 失焦 / 隐藏标签页 | 暂停、清空输入；继续前重新倒数 |
| 触屏控件 | 移动、瞄准、射击、跳跃、工具与交互 |

暂停冻结计时、玩法与终局尾段；接触当帧锁定失败，完整爆炸后只交付一次结果。主动退出是放弃；刷新不伪造完成成绩，已结束待上传项按原归属恢复。手机控件与响应式布局已有实现，真实手机性能与触控手感仍需实机验收。

Git 归档排除 .env、本机数据库/日志、下载工具、依赖、构建缓存与 IDE 状态；sample/sample.zip 不提交，展开示例保留为参考。图册是设计参考，不代表当前真实画质。

## 验证与三分钟演示

~~~powershell
# nailong/：独立 PostgreSQL 测试库
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/test-backend.ps1

# nailong/frontend/
npm run typecheck
npm test
npm run build
npm run test:production

# nailong/threejs/
npm test
npm run build
~~~

本轮已完成的自动化检查（2026-11-01，来自主代理与负责实现者的最终执行记录）：

| 检查 | 已取得结果 | 证据范围 |
|---|---|---|
| 前端单元与契约测试 | **178/178 通过** | 解码、目标、工具、编辑、补传和回放边界 |
| 前端生产构建 | **成功**，入口 index-YAtw9WGR.js | 当前源码的 Vite 生产产物 |
| 生产包 API 检查 | **24 个 API / 31 组有效响应 / 31 组坏响应拒绝通过** | 执行实际生产包，检查类名与解码，不以源码替代构建 |
| Scala + PostgreSQL | **全量 137/137 通过**；固定事务隔离后 records **12/12 定向复验通过** | 真实独立测试库的版本、归属、事务与录像一致性 |
| 实际 HTTP 协议联调 | **34/34 通过** | 隔离 QA 账号与协议数据；不是实际游玩录像证据 |

**浏览器已验证正式败局结算与真实回放闭环、回放刷新及Home/End定位、地图编辑保存冻结和试玩载入；编辑器390×844视口无横向溢出。** 范围见 [IMPLEMENTATION_QA.md](docs/IMPLEMENTATION_QA.md)，实际败局保存核对见 [实战录制证据](docs/expansion-live-recording-verification.json)。真实胜利路线、断网恢复、任意鼠标拖动、网络保存请求计数与实体手机仍未验收。HTTP详情见 [本轮协议验收数据](docs/expansion-http-verification.json)；[VERIFICATION.md](docs/VERIFICATION.md) 保留此前四机版本的历史记录，不替代本轮验证，也不把合成协议成绩视为实际通关。

待真实用户验证：至少五位新玩家各玩两局，观察他们能否解释任务/失败原因，以及第二局是否主动调整路线或工具时机；另测保守清场撤离和保留至少两机的撤离、加载/帧率/录像体积与真实手机操作。当前没有把这些目标写成已取得结果。

[当前三分钟讲稿](docs/DEMO_3_MINUTES.md)已对应任务、一次工具、真实回放和工坊；现场使用经过核验的真实记录，具体流程状态以本轮 QA 为准：

| 时间 | 演示 |
|---|---|
| 0:00–0:30 | 营地进入任务，说明信标目标与一次工具选择 |
| 0:30–1:00 | 展示扫描、发现、掩体或工具改变视线 |
| 1:00–1:50 | 打开一局真实报告和回放，跳到关键事件，切俯视 |
| 1:50–2:40 | 复制地图，移动一处掩体，校验后进入同核心试玩 |
| 2:40–3:00 | 冻结新版本，展示旧记录仍引用原地图 |

无需机械翻完十个页面。预先完成的真实记录应说明来源；概念图与虚构示意不充当实录。

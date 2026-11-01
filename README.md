# 奶龙小靶场 · 群山之间

## 完整代码架构

正式应用位于 `frontend/` 与 `backend/`；`threejs/` 保留独立的渲染、操作和素材实验区。下面按实际文件展开，文件后的 `#` 说明职责。排除 `node_modules/`、`target/`、`dist/`、`.local/`、`.tools/`、`.asset-cache/`、`.npm-cache/`、`.git/`、缓存与日志；这些是依赖、构建产物、本机数据库/工具或下载缓存。`.env` 含本机凭据，不展示内容、不提交。

<!-- FILE_TREE_START -->
```text
nailong/
├── README.md  # 本目录架构、运行方式与实现说明
├── .gitignore  # 排除依赖、产物、工具缓存和本机凭据
├── .env.example  # 本机数据库与 API 环境变量模板，不含真实密码
├── 类型安全 10.29.pdf  # 课程类型安全、IO、前后端边界与模块化笔记
├── backend/  # Scala API、类型、表操作与数据库测试
│   ├── project/
│   │   └── build.properties  # 固定 sbt 版本
│   ├── src/
│   │   ├── main/
│   │   │   ├── resources/
│   │   │   │   └── game-config.json  # 首版四机清除规则与地形初始值
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
│   │   │           │   │   ├── GetMyBestAPIMessage.scala  # 执行：查询同地图同规则最快胜利
│   │   │           │   │   ├── GetTrainingResultAPIMessage.scala  # 执行：查询本人单局成绩
│   │   │           │   │   ├── ListMyResultsAPIMessage.scala  # 执行：分页查询本人历史
│   │   │           │   │   └── SaveTrainingResultAPIMessage.scala  # 执行：校验并幂等保存本人终局
│   │   │           │   ├── objects/
│   │   │           │   │   ├── apiTypes/
│   │   │           │   │   │   ├── PersonalBestResponse.scala  # 同地图同规则最快胜利或空值
│   │   │           │   │   │   ├── ResultListResponse.scala  # 个人历史列表及分页信息
│   │   │           │   │   │   └── ResultLookupResponse.scala  # 单局成绩或尚无成绩的返回结构
│   │   │           │   │   ├── ResultOutcome.scala  # 后端 victory/defeat 胜负枚举
│   │   │           │   │   ├── ResultSubmission.scala  # 客户端冻结的胜负和汇总成绩输入
│   │   │           │   │   └── TrainingResult.scala  # 持久化的归属、胜负、命中、用时与规则信息
│   │   │           │   ├── routes/
│   │   │           │   │   └── RecordsRoutes.scala  # 声明本服务面向浏览器的消息注册表
│   │   │           │   ├── tables/
│   │   │           │   │   └── trainingresult/
│   │   │           │   │       ├── TrainingResultTable.scala  # 封装终局成绩表的 SQL、行映射和公开 IO 方法
│   │   │           │   │       └── TrainingResultTableInitializer.scala  # 初始化终局成绩表、约束与索引
│   │   │           │   └── utils/
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
│   │   │           └── training/
│   │   │               ├── api/
│   │   │               │   ├── AbandonTrainingRunAPIMessage.scala  # 执行：锁定并放弃本人未完成局次
│   │   │               │   ├── GetTrainingConfigAPIMessage.scala  # 执行：读取当前版本规则
│   │   │               │   ├── GetTrainingRunAPIMessage.scala  # 执行：查询本人局次及快照
│   │   │               │   └── StartTrainingRunAPIMessage.scala  # 执行：幂等创建并冻结局次
│   │   │               ├── objects/
│   │   │               │   ├── apiTypes/
│   │   │               │   │   └── AbandonRunResponse.scala  # 放弃操作返回的局次状态
│   │   │               │   ├── DroneRules.scala  # 血量、扫描、搜索、巡逻、追击与接触规则
│   │   │               │   ├── DroneSpawn.scala  # 无人机出生位置与朝向
│   │   │               │   ├── Point3.scala  # 以米为单位的三维纯数据坐标
│   │   │               │   ├── RunId.scala  # 一次行动的 UUID，也是保存去重键
│   │   │               │   ├── TerrainConfig.scala  # 可调整山丘高度、宽度、位置与起伏
│   │   │               │   ├── TrainingConfig.scala  # 版本化地形、无人机和武器规则
│   │   │               │   ├── TrainingConfigId.scala  # 玩法配置的独立 UUID 类型
│   │   │               │   ├── TrainingRun.scala  # 冻结账号、规则、地形和状态的局次
│   │   │               │   ├── TrainingRunStatus.scala  # 后端局次 open/completed/abandoned 状态
│   │   │               │   └── WeaponConfig.scala  # 射击间隔、弹速和射程
│   │   │               ├── routes/
│   │   │               │   └── TrainingRoutes.scala  # 声明本服务面向浏览器的消息注册表
│   │   │               ├── tables/
│   │   │               │   ├── trainingconfig/
│   │   │               │   │   ├── TrainingConfigTable.scala  # 封装版本配置表的 SQL、行映射和公开 IO 方法
│   │   │               │   │   └── TrainingConfigTableInitializer.scala  # 初始化版本配置表、约束与索引
│   │   │               │   └── trainingrun/
│   │   │               │       ├── TrainingRunTable.scala  # 封装局次与冻结快照表的 SQL、行映射和公开 IO 方法
│   │   │               │       └── TrainingRunTableInitializer.scala  # 初始化局次与冻结快照表、约束与索引
│   │   │               └── utils/
│   │   │                   ├── TrainingConfigResource.scala  # 解析并校验随后端发布的初始规则
│   │   │                   └── ValidateTerrain.scala  # 本服务地形参数范围校验
│   │   └── test/
│   │       └── scala/
│   │           └── services/
│   │               ├── player/
│   │               │   └── PlayerSecuritySuite.scala  # 密码哈希、令牌和账号输入校验测试
│   │               ├── records/
│   │               │   └── ResultValidationSuite.scala  # 胜负、血量汇总和射速合理性测试
│   │               ├── training/
│   │               │   └── TrainingValidationSuite.scala  # 局次规则、地形范围与配置校验测试
│   │               ├── BackendIntegrationSuite.scala  # 真实数据库、认证、归属与并发事务测试
│   │               └── ContractFixtureSuite.scala  # 前后端共享 JSON 样本的真实 Circe 契约检查
│   └── build.sbt  # Scala 版本、后端依赖、入口与测试配置
├── frontend/  # 正式 React 与 Three.js 应用，端口 5173
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
│   │   └── check-api-names.mjs  # 检查生产构建后的 API 类名与路由契约
│   ├── src/
│   │   ├── apis/
│   │   │   ├── player/
│   │   │   │   ├── GetCurrentPlayerAPI.ts  # 调用：读取当前公开玩家资料
│   │   │   │   ├── LoginPlayerAPI.ts  # 调用：验证密码并登录
│   │   │   │   ├── LogoutPlayerAPI.ts  # 调用：撤销当前会话
│   │   │   │   └── RegisterPlayerAPI.ts  # 调用：注册账号并签发会话
│   │   │   ├── records/
│   │   │   │   ├── GetMyBestAPI.ts  # 调用：查询同地图同规则最快胜利
│   │   │   │   ├── GetTrainingResultAPI.ts  # 调用：查询本人单局成绩
│   │   │   │   ├── ListMyResultsAPI.ts  # 调用：分页查询本人历史
│   │   │   │   └── SaveTrainingResultAPI.ts  # 调用：校验并幂等保存本人终局
│   │   │   └── training/
│   │   │       ├── AbandonTrainingRunAPI.ts  # 调用：锁定并放弃本人未完成局次
│   │   │       ├── GetTrainingConfigAPI.ts  # 调用：读取当前版本规则
│   │   │       ├── GetTrainingRunAPI.ts  # 调用：查询本人局次及快照
│   │   │       └── StartTrainingRunAPI.ts  # 调用：幂等创建并冻结局次
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
│   │   │   │   │   ├── ResultListResponse.ts  # 个人历史列表及分页信息
│   │   │   │   │   └── ResultLookupResponse.ts  # 单局成绩或尚无成绩的返回结构
│   │   │   │   ├── ResultSubmission.ts  # 客户端冻结的胜负和汇总成绩输入
│   │   │   │   ├── RunOutcome.ts  # 前端 victory/defeat 胜负类型及解码
│   │   │   │   └── TrainingResult.ts  # 持久化的归属、胜负、命中、用时与规则信息
│   │   │   ├── system/
│   │   │   │   ├── Instant.ts  # 带时区 ISO 时间字符串的品牌类型与解码
│   │   │   │   └── SessionToken.ts  # 不透明会话令牌的类型与校验
│   │   │   └── training/
│   │   │       ├── apiTypes/
│   │   │       │   └── AbandonRunResponse.ts  # 放弃操作返回的局次状态
│   │   │       ├── DroneRules.ts  # 血量、扫描、搜索、巡逻、追击与接触规则
│   │   │       ├── DroneSpawn.ts  # 无人机出生位置与朝向
│   │   │       ├── Point3.ts  # 以米为单位的三维纯数据坐标
│   │   │       ├── RunId.ts  # 一次行动的 UUID，也是保存去重键
│   │   │       ├── RunStatus.ts  # 前端局次有限状态及解码
│   │   │       ├── TerrainConfig.ts  # 可调整山丘高度、宽度、位置与起伏
│   │   │       ├── TrainingConfig.ts  # 版本化地形、无人机和武器规则
│   │   │       ├── TrainingConfigId.ts  # 玩法配置的独立 UUID 类型
│   │   │       ├── TrainingRun.ts  # 冻结账号、规则、地形和状态的局次
│   │   │       └── WeaponConfig.ts  # 射击间隔、弹速和射程
│   │   ├── pages/
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
│   │   │   │   │   └── ResultRow.tsx  # 历史列表的一局成绩与详情入口
│   │   │   │   ├── hooks/
│   │   │   │   │   └── useHistory.ts  # 查询个人历史、分页和最佳成绩
│   │   │   │   ├── objects/
│   │   │   │   │   ├── BestState.ts  # 个人最佳的加载、结果与失败状态
│   │   │   │   │   ├── HistoryState.ts  # 历史页加载、空、就绪与失败状态
│   │   │   │   │   └── MoreState.ts  # 历史分页的加载更多状态
│   │   │   │   └── index.tsx  # 组合个人历史、分页与最佳成绩
│   │   │   ├── Home/
│   │   │   │   └── index.tsx  # 首页主视觉、行动、练习和成绩入口
│   │   │   ├── Result/
│   │   │   │   ├── components/
│   │   │   │   │   └── ResultSummary.tsx  # 胜负、命中率、用时与保存信息
│   │   │   │   ├── hooks/
│   │   │   │   │   └── useResult.ts  # 读取并恢复本人单局详情
│   │   │   │   ├── objects/
│   │   │   │   │   └── ResultPageState.ts  # 单局详情的加载、就绪、空和失败状态
│   │   │   │   ├── utils/
│   │   │   │   │   └── formatResult.ts  # 成绩用时、零发命中率和日期的展示函数
│   │   │   │   └── index.tsx  # 组合可刷新查询的单局详情
│   │   │   └── Training/
│   │   │       ├── components/
│   │   │       │   ├── GameView.tsx  # React 画布挂载、配置传入与终局回调桥
│   │   │       │   └── TerrainControls.tsx  # 正式开局前调整允许范围内的地形
│   │   │       ├── data/
│   │   │       │   └── practice-config.json  # 游客练习的离线规则快照，与后端初始配置测试对齐
│   │   │       ├── functions/
│   │   │       │   └── practiceConfig.ts  # 运行时解码游客练习的随包规则
│   │   │       ├── game/
│   │   │       │   ├── core/
│   │   │       │   │   ├── assets.ts  # 加载 GLB、检查动画节点并建立资源类型
│   │   │       │   │   ├── cameraObstruction.ts  # 相机与地形、箱体的遮挡检测
│   │   │       │   │   ├── challenge.ts  # 倒数、有效时间、胜负与终局去重
│   │   │       │   │   ├── controller.ts  # 键鼠输入、平滑瞄准、蓝框转向与镜头缩放
│   │   │       │   │   ├── defaultRules.ts  # 原型默认玩法参数，与正式契约保持对应
│   │   │       │   │   ├── droneBrain.ts  # 扫描、受击搜索、锁定、血量与击毁逻辑
│   │   │       │   │   ├── droneEncounter.ts  # 组合四机 AI、视线、移动、命中与接触
│   │   │       │   │   ├── droneMotion.ts  # 巡逻、追击、避障及连续接触计算
│   │   │       │   │   ├── droneVisuals.ts  # 红色扫描区、三格血条与警戒外观
│   │   │       │   │   ├── explosion.ts  # 无人机接触爆炸的火光、冲击环与粒子
│   │   │       │   │   ├── gardenDetails.ts  # 花谷近景路径和装饰细节
│   │   │       │   │   ├── meadowBackdrop.ts  # 天空、远山与场景大背景
│   │   │       │   │   ├── movement.ts  # 角色地形运动、跳跃与箱体落脚碰撞
│   │   │       │   │   ├── natureEnvironment.ts  # 植被实例、距离分级、淡出与遮挡处理
│   │   │       │   │   ├── natureLod.ts  # 读取和选择离线简化植被网格
│   │   │       │   │   ├── obstacles.ts  # 统一箱桶等可阻挡几何定义
│   │   │       │   │   ├── props.ts  # 可选道具原型及状态更新
│   │   │       │   │   ├── scene.ts  # 组装场景、角色、灯光、模型与对象引用
│   │   │       │   │   ├── shooting.ts  # 脉冲弹池、枪口闪光与命中反馈
│   │   │       │   │   ├── shootingMath.ts  # 连续弹道、准星与首个碰撞点计算
│   │   │       │   │   ├── terrain.ts  # 共享高度函数、地形网格与山地边界
│   │   │       │   │   ├── terrainEditor.ts  # 原型地形参数编辑与重置
│   │   │       │   │   ├── touchControls.ts  # 手机移动、瞄准、射击与跳跃输入
│   │   │       │   │   └── worldLayout.ts  # 场景尺寸、出生点及静态物件布局
│   │   │       │   ├── audio.ts  # Web Audio 合成射击、命中、倒数与爆炸音效
│   │   │       │   ├── game.css  # 游戏画布、HUD、触屏控件与特效所需样式
│   │   │       │   ├── mountGame.ts  # 挂载和销毁正式 Three.js 行动生命周期
│   │   │       │   ├── resources.ts  # 去重释放几何、纹理、材质、骨架和 GPU 资源
│   │   │       │   └── roundCompletion.ts  # 冻结终局，等待爆炸可视反馈后仅交付一次结果
│   │   │       ├── hooks/
│   │   │       │   └── useTraining.ts  # 取得规则、建局、冻结终局并协调保存
│   │   │       ├── objects/
│   │   │       │   ├── ActiveTraining.ts  # 正式局次或练习的冻结配置、账号与挂载键
│   │   │       │   └── Preparation.ts  # 行动准备的加载、错误和可调地形状态
│   │   │       └── index.tsx  # 组合地形准备、行动画布与胜负保存面板
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
│   │   │   └── contract.json  # 与后端一致的合法契约测试样本
│   │   ├── api.test.ts  # 请求名称、状态码与解码边界测试
│   │   ├── contracts.test.ts  # DTO 字段、枚举、UUID 和非法输入测试
│   │   ├── game-completion.test.ts  # 终局冻结、爆炸延迟、回调去重与卸载取消测试
│   │   ├── game-resources.test.ts  # 卸载时几何、材质、贴图和骨架去重释放测试
│   │   ├── identity.typecheck.ts  # 不同品牌 ID 不可混用的编译负例
│   │   ├── pendingQueue.test.ts  # 账号隔离、重复保存和失败重试测试
│   │   ├── practiceConfig.test.ts  # 游客离线配置与后端初始规则一致性测试
│   │   ├── session.test.ts  # 会话恢复、注销和旧请求竞态测试
│   │   ├── sessionToken.test.ts  # 会话令牌存储与损坏值处理测试
│   │   └── settings.test.ts  # 本机设置范围与非法值解码测试
│   ├── index.html  # 浏览器入口和应用挂载点
│   ├── package-lock.json  # 锁定 npm 依赖版本
│   ├── package.json  # 依赖以及开发、测试和构建命令
│   ├── postcss.config.mjs  # 加载 Tailwind CSS 的 PostCSS 插件
│   ├── tsconfig.json  # TypeScript 严格检查配置
│   └── vite.config.ts  # Vite 开发、构建与路径配置
├── scripts/  # 本地 Java、PostgreSQL 与 API 运行工具
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
│   └── test-backend.ps1  # 使用隔离数据库运行后端测试
├── docs/  # 契约、设计、演示与验收文档
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
│   ├── REQUIREMENTS_AUDIT.md  # 用户要求、课程规则与完整验收清单
│   ├── UI_DIRECTION.md  # 页面视觉方向与各交互状态设计
│   └── VERIFICATION.md  # 实际测试、数据库和浏览器验收证据
└── threejs/  # 独立原型入口和素材制作工具，端口 5174
    ├── docs/
    │   ├── preview-before-style.png  # 浏览器或素材实际截图：before-style
    │   ├── preview-character-refresh.png  # 浏览器或素材实际截图：character-refresh
    │   ├── preview-controls.png  # 浏览器或素材实际截图：controls
    │   ├── preview-countdown-fixed.png  # 浏览器或素材实际截图：countdown-fixed
    │   ├── preview-crate-jump.png  # 浏览器或素材实际截图：crate-jump
    │   ├── preview-drone-defeat.png  # 浏览器或素材实际截图：drone-defeat
    │   ├── preview-drone-hunt.png  # 浏览器或素材实际截图：drone-hunt
    │   ├── preview-drone-victory.png  # 浏览器或素材实际截图：drone-victory
    │   ├── preview-fantasy-crate.png  # 浏览器或素材实际截图：fantasy-crate
    │   ├── preview-game.png  # 浏览器或素材实际截图：game
    │   ├── preview-lod.png  # 浏览器或素材实际截图：lod
    │   ├── preview-megakit.png  # 浏览器或素材实际截图：megakit
    │   ├── preview-mobile.png  # 浏览器或素材实际截图：mobile
    │   ├── preview-open-valley.png  # 浏览器或素材实际截图：open-valley
    │   ├── preview-render-refresh.png  # 浏览器或素材实际截图：render-refresh
    │   ├── preview-tree-occlusion.png  # 浏览器或素材实际截图：tree-occlusion
    │   ├── preview-valley-camp.png  # 浏览器或素材实际截图：valley-camp
    │   ├── preview-valley.png  # 浏览器或素材实际截图：valley
    │   ├── preview.png  # 浏览器或素材实际截图：preview
    │   └── PROP_DESIGN.md  # 道具与场景变化的候选设计
    ├── public/
    │   └── assets/
    │       ├── arena/
    │       │   ├── eye-drone.glb  # 运行用无人机模型与动作
    │       │   ├── License_Fantasy_Standard.txt  # 箱桶素材原始许可
    │       │   ├── License_SciFi_Standard.txt  # 无人机素材原始许可
    │       │   ├── manifest.json  # 所属素材集合的来源、节点与尺寸清单
    │       │   └── props.glb  # 运行用 Fantasy 箱桶素材集合
    │       ├── models/
    │       │   ├── asset-info.json  # 本地生成 GLB 的尺寸、节点和动画清单
    │       │   ├── bubble-gun.glb  # 紧凑脉冲枪，沿用旧文件名，含 muzzle
    │       │   ├── bush.glb  # 历史程序灌木原型
    │       │   ├── crate.glb  # 历史程序木箱原型
    │       │   ├── nailong.glb  # 本地梨形角色，含四段动画和挂枪节点
    │       │   ├── rock.glb  # 历史程序岩石原型
    │       │   ├── target.glb  # 历史圆靶原型，保留素材实验使用
    │       │   ├── tree.glb  # 历史程序树原型
    │       │   └── wall-segment.glb  # 历史程序矮墙段原型
    │       └── nature/
    │           ├── License_Standard.txt  # 自然素材 Standard 原始许可
    │           ├── manifest.json  # 所属素材集合的来源、节点与尺寸清单
    │           ├── megakit-lod.json  # 植被离线 LOD 网格数据
    │           └── megakit.glb  # 精选自然植被和岩石模型集合
    ├── scripts/
    │   ├── create-pulse-blaster.mjs  # 生成奶白与深青紧凑脉冲枪模型
    │   ├── download-asset-packs.mjs  # 下载选用素材包并校验归档
    │   ├── generate-assets.mjs  # 生成并验证本地角色和原型 GLB
    │   ├── inspect-asset-packs.mjs  # 检查素材包模型、动画与贴图
    │   ├── prepare-arena-assets.mjs  # 整理箱桶和无人机为运行用 GLB
    │   ├── prepare-megakit.mjs  # 从 MegaKit 整理精选自然模型
    │   └── prepare-nature-lod.mjs  # 离线生成植被简化网格级别
    ├── src/
    │   ├── game/
    │   │   ├── assets.ts  # 重导出正式核心：加载 GLB、检查动画节点并建立资源类型
    │   │   ├── cameraObstruction.ts  # 重导出正式核心：相机与地形、箱体的遮挡检测
    │   │   ├── challenge.ts  # 重导出正式核心：倒数、有效时间、胜负与终局去重
    │   │   ├── controller.ts  # 重导出正式核心：键鼠输入、平滑瞄准、蓝框转向与镜头缩放
    │   │   ├── defaultRules.ts  # 重导出正式核心：原型默认玩法参数，与正式契约保持对应
    │   │   ├── droneBrain.ts  # 重导出正式核心：扫描、受击搜索、锁定、血量与击毁逻辑
    │   │   ├── droneEncounter.ts  # 重导出正式核心：组合四机 AI、视线、移动、命中与接触
    │   │   ├── droneMotion.ts  # 重导出正式核心：巡逻、追击、避障及连续接触计算
    │   │   ├── droneVisuals.ts  # 重导出正式核心：红色扫描区、三格血条与警戒外观
    │   │   ├── explosion.ts  # 重导出正式核心：无人机接触爆炸的火光、冲击环与粒子
    │   │   ├── gardenDetails.ts  # 重导出正式核心：花谷近景路径和装饰细节
    │   │   ├── meadowBackdrop.ts  # 重导出正式核心：天空、远山与场景大背景
    │   │   ├── movement.ts  # 重导出正式核心：角色地形运动、跳跃与箱体落脚碰撞
    │   │   ├── natureEnvironment.ts  # 重导出正式核心：植被实例、距离分级、淡出与遮挡处理
    │   │   ├── natureLod.ts  # 重导出正式核心：读取和选择离线简化植被网格
    │   │   ├── obstacles.ts  # 重导出正式核心：统一箱桶等可阻挡几何定义
    │   │   ├── props.ts  # 重导出正式核心：可选道具原型及状态更新
    │   │   ├── scene.ts  # 重导出正式核心：组装场景、角色、灯光、模型与对象引用
    │   │   ├── shooting.ts  # 重导出正式核心：脉冲弹池、枪口闪光与命中反馈
    │   │   ├── shootingMath.ts  # 重导出正式核心：连续弹道、准星与首个碰撞点计算
    │   │   ├── terrain.ts  # 重导出正式核心：共享高度函数、地形网格与山地边界
    │   │   ├── terrainEditor.ts  # 重导出正式核心：原型地形参数编辑与重置
    │   │   ├── touchControls.ts  # 重导出正式核心：手机移动、瞄准、射击与跳跃输入
    │   │   └── worldLayout.ts  # 重导出正式核心：场景尺寸、出生点及静态物件布局
    │   ├── main.ts  # 独立原型的启动、界面、输入与游戏循环
    │   └── style.css  # 独立原型的菜单、画布与 HUD 样式
    ├── tests/
    │   ├── camera.test.ts  # 相机避障、跟随与瞄准测试
    │   ├── challenge.test.ts  # 倒数、四机全清、失败终局和重开测试
    │   ├── config-rules.test.ts  # 共享核心默认参数与正式配置规则一致性测试
    │   ├── droneBrain.test.ts  # 扫描角度、受击搜索与视线测试
    │   ├── droneMotion.test.ts  # 巡逻、追击、避障与连续接触测试
    │   ├── droneTakeoff.test.ts  # 多帧率起飞、保护期、可见受击追击与遮挡搜索测试
    │   ├── explosion.test.ts  # 爆炸时间、状态与清理测试
    │   ├── movement.test.ts  # 移动、跳跃、坡地和箱体落地测试
    │   ├── shooting.test.ts  # 连续弹道、遮挡与命中测试
    │   └── terrain.test.ts  # 高度、环山边界与网格预算测试
    ├── .gitignore  # 排除依赖、产物、工具缓存和本机凭据
    ├── ASSET_CREDITS.md  # 实际素材来源、作者、许可与修改记录
    ├── index.html  # 浏览器入口和应用挂载点
    ├── package-lock.json  # 锁定 npm 依赖版本
    ├── package.json  # 依赖以及开发、测试和构建命令
    ├── README.md  # 本目录架构、运行方式与实现说明
    ├── tsconfig.json  # TypeScript 严格检查配置
    └── vite.config.ts  # Vite 开发、构建与路径配置
```
<!-- FILE_TREE_END -->

`sample/`、`experience/`、`singleplayer-experience/` 是课程示例与历史体验资料，不是第二套成品应用，故不在应用文件树中逐项展开。类型与结构依据见[类型安全笔记](<类型安全 10.29.pdf>)、[课程规则](sample/rules.txt)和[需求审计](docs/REQUIREMENTS_AUDIT.md)。历史图册里的 30 秒圆靶已由当前无人机玩法替代。

## 现在做什么

玩家先看到游戏首页，选择“开始行动”“自由练习”“我的成绩”或设置。正式行动和成绩需要账号；未登录时才出现注册/登录弹窗，成功后继续刚才的操作。自由练习不写账号成绩。

一局有 **4 架巡逻无人机，每架 3 格血量**。无人机先起飞巡逻，红色约 90° 扫描区发现玩家后转入俯冲追击；锁定且仍看得见玩家时，受击继续追击，尚未发现玩家或视线已被挡住时，受击才高速搜索。玩家利用箱子与地形遮挡、移动和跳跃寻找射击机会。四架全部击毁为胜利；无人机接触玩家后自爆，立即终止正常玩法并显示失败结算。没有 30 秒截止，成绩记录有效游玩用时。

前端采用 **TypeScript + React + Vite + Tailwind CSS + Three.js**。后端采用 **Scala 3 + Cats Effect + http4s + Circe + JDBC/HikariCP + PostgreSQL**。课程所说的“微服务”在这里是同一个 Scala 进程中的业务模块：`player` 管账号，`training` 管配置与局次，`records` 管成绩，`system` 管公共运行边界。它们共享 PostgreSQL，但每张表的维护归属明确。

本 README 解释实际代码与运行方式；源码存在不等于已通过整机验收。最新执行结果集中在[验收记录](docs/VERIFICATION.md)，三分钟展示顺序见[演示讲稿](docs/DEMO_3_MINUTES.md)。

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

## 类型安全与请求边界

### 从对象到数据库

```text
React 事件
  → new StartTrainingRunAPI(...).send()
  → system/api：名称、令牌、HTTP、unknown 响应解码
  → Scala 路由：JSON 解码、token 验证、可信身份转换
  → StartTrainingRunAPIMessage(...).plan(connection): IO[TrainingRun]
  → 封装的 Table 方法：参数绑定、SQL、行映射
  → 同一事务提交 / 回滚
  → Circe 编码 DTO → 前端运行时解码 → 不可变页面状态
```

- 一个后端动作一个 `final case class` 消息文件，输入在构造参数里，执行入口为 `plan(connection: Connection): IO[Response]`。无业务输入用 `NoRequestMessage`；不为所有操作强加万能 Context，不新增只负责转发的 Service 层。
- API 可以调用任意服务公开消息的 `plan` 或公开 Table 方法；每个操作传递同一条连接。只有外层 `DatabaseSession` 提交或回滚，JDBC 阻塞操作放 `IO.blocking`，资源在边界释放。
- 每表一个 `XXTable` 和一个 `XXTableInitializer`。SQL、参数绑定与行映射在表模块；SQL 值私有，公开方法返回 `IO[T]`。`utils` 是所属服务的私有辅助能力，不跨服务直调。
- 每个领域类型独立文件，伴生对象负责 Circe 编解码。ID 有独立类型，`PlayerId` 不能冒充 `RunId`；网络仍传 UUID 字符串。有限状态用 Scala enum 与 TypeScript 联合类型表达。
- 路由名统一由类型名得到：`SaveTrainingResultAPIMessage` / `SaveTrainingResultAPI` 对应 `POST /api/savetrainingresultapi`。前端不在页面拼 URL；当前生产构建关闭名字压缩，并有生产产物名称检查。
- HTTP 响应、URL 参数和本地存储都从 `unknown` 解码，再交给业务。`as TrainingResult` 不是数据校验。成功返回一个明确 DTO，失败返回 `{ code, message }`；错误码与 HTTP 状态在契约中列明。
- 注册/登录不需要令牌；其他个人操作由基础设施添加 `userToken`。路由验证后注入可信 `playerId/sessionId`，拒绝客户端伪造身份字段。后端内部 `ResolvePlayerToken` 不开放 HTTP。
- 时间点用带时区 ISO 8601，时长毫秒，坐标米，速度米/秒；扫描角度为度、角速度为弧度/秒。空值明确为 `null`，空列表为 `[]`。Mesh、材质、音频节点、密码哈希不进入公开 DTO。

完整字段、合法范围与错误形状以 [API 契约](docs/API_CONTRACT.md) 为准。规则来源是[类型安全笔记](<类型安全 10.29.pdf>)与课程 sample 的组织形式；sample 中直接强转 JSON、仅服务内部可见的 Table 和分散系统目录没有照搬。

## 后端：按服务阅读

### player：账号与会话

| `api/` 消息（省略 APIMessage 后缀） | 输入 | `IO` 内的返回类型 |
|---|---|---|
| RegisterPlayer | username、password、nickname | AuthResponse |
| LoginPlayer | username、password | AuthResponse |
| GetCurrentPlayer | 可信 playerId | PlayerProfile |
| LogoutPlayer | 可信 playerId、sessionId | LogoutResponse |
| ResolvePlayerToken（内部） | SessionToken | AuthenticatedPlayer |

`objects/` 中 `PlayerId/SessionId` 包装 UUID；`SessionToken` 是不透明凭证；`PlayerProfile` 只包含公开资料；`StoredPlayer/StoredSession` 是含哈希的内部持久化数据；`AuthenticatedPlayer` 是验证后的身份结论。`objects/apiTypes/` 放认证与退出响应。

`routes/PlayerRoutes` 只注册四个公开 API。`tables/player` 管 `players`：账号规范化、唯一用户名、昵称、密码哈希；`tables/playersession` 管 `player_sessions`：令牌摘要、归属、过期和撤销。账号与会话创建在同一事务里；会话只撤销当前 session。

`utils/PlayerValidation` 校验账号/昵称/密码；`PlayerSecrets` 生成盐、哈希和随机令牌；`PlayerSession` 组织签发。当前使用 PBKDF2-HMAC-SHA256、独立随机盐，随机会话令牌仅存 SHA-256 摘要，默认七天有效。响应不返回密码哈希或存储中的令牌摘要。

### training：规则与局次

| `api/` 消息 | 输入 | 返回 |
|---|---|---|
| GetTrainingConfig | 无，公开 | TrainingConfig |
| StartTrainingRun | 可信 playerId、requestId、configId、configVersion、terrain | TrainingRun |
| GetTrainingRun | 可信 playerId、runId | TrainingRun |
| AbandonTrainingRun | 可信 playerId、runId | AbandonRunResponse |

`TrainingConfig` 组合 `TerrainConfig`、`DroneRules` 与 `WeaponConfig`，包括地形函数参数、无人机生成点/血量/扫描/巡逻/追击参数，以及射击间隔、弹速和射程。`Point3/DroneSpawn` 是纯数据；`RunId/TrainingConfigId` 是独立 ID。`TrainingRun` 冻结配置、地形、归属与起止时间；`TrainingRunStatus` 为 `open/completed/abandoned`，不等同于游戏的胜负。

`routes/TrainingRoutes` 注册四个接口。`tables/trainingconfig` 管不可原地覆盖的版本配置；启动时读取 `resources/game-config.json`。`tables/trainingrun` 管局次与快照，`(player_id, request_id)` 唯一。`utils/TrainingConfigResource` 读取初始配置，`ValidateTerrain` 校验用户选择的地形范围。

一次开始操作生成一个 requestId；网络重试保持不变，相同输入返回同一局，不同输入返回 409。再玩一局才换新 requestId。旧配置版本不能偷偷进入当前规则；历史局次使用自己的冻结快照。可调地形范围是山丘高度 0–4、宽度 2.5–9、中心 X/Z 各 −8–8、起伏 0–0.8；只接受有限数值。

当前配置为 `resources/game-config.json` 中的 **`drone-hunt-v2`**，保留同一配置 ID 下的 v1 历史。四架无人机各 3 HP，扫描 90°/12 m，巡逻 1.1 m/s，追击 7.2 m/s。开始时机体中心相对地面从 0.82 m 在 1.25 秒内平滑升到 2.2 m；锁定后逐渐俯冲至 1.2 m 并追击。锁定且目标仍可见时受击不打断追击，未发现目标或已被遮挡时受击进入搜索。武器保持 250 ms 一发、弹速 30 m/s、射程 40 m。服务器局次配置实际传入正式引擎；旧局次快照不会被新规则改写，两版最佳成绩分开比较。具体执行与浏览器检查结果见[验收记录](docs/VERIFICATION.md)。

### records：终局保存与个人历史

| `api/` 消息 | 输入 | 返回 |
|---|---|---|
| SaveTrainingResult | 可信 playerId、runId、submission | TrainingResult |
| GetTrainingResult | 可信 playerId、runId | ResultLookupResponse |
| ListMyResults | 可信 playerId、offset、limit | ResultListResponse |
| GetMyBest | 可信 playerId、configId、configVersion、terrain | PersonalBestResponse |

`ResultSubmission` 包含 `outcome`（victory/defeat）、`shotsFired`、`hits`、`destroyed`、`elapsedMs`。**hits 是造成有效伤害的命中数，destroyed 是击毁数**；四架三格血全清需要 12 次有效命中。`TrainingResult` 还带 RunId、归属、配置/地形、服务器计算的命中率和保存时间。零发射时数据命中率为 0，界面显示“—”。

`routes/RecordsRoutes` 全部要求身份。`tables/trainingresult` 管 `training_results`，以 run_id 唯一防重，查询始终限制本人。`utils/ResultValidation` 校验非负整数、命中不多于发射、伤害与击毁数、胜负条件、射速与有效用时，并比较重复提交内容。

保存先锁本人局次，再查已有成绩：相同内容直接返回，不同内容 409，已放弃不能提交。插入结果和把局次标为 completed 在同一事务内共同成功或回滚。放弃也锁同一局次，避免与保存产生冲突状态。失败也属于完成的一次尝试；主动退出属于 abandoned。

历史使用 offset/limit 分页（limit 1–50），按保存时间和 RunId 稳定排序。个人最佳只比较**同配置、同版本、同地形的胜利**，先用时升序，再命中率降序，最后保存时间稳定排序；失败不会成为最快通关。不存在成绩时 `result/best` 明确为 null。

### system：启动与公共边界

`Main` 是 IOApp 入口，读取 API 配置、取得数据库资源、按外键顺序初始化五张表，然后启动 http4s。`DatabaseInitializer` 仅组合各表的初始化，不集中堆放建表 SQL；`DatabaseSession` 负责 Hikari 连接池与事务资源。

`api/` 含消息基类、注册信息、名称推导与统一执行；`routes/ApiRouter` 合并业务注册表并提供健康检查。`objects/` 放 DatabaseConfig、HttpError、ErrorCode/ErrorResponse、HealthResponse 与时间编解码。这个服务没有业务表，也不为目录对称创建空 tables/utils。

## 前端：按同样的服务顺序阅读

前端保持 sample 的 `apis/<服务>`、`objects/<服务>` 和 `pages/<页面>`，没有重排为后端式 services 目录。`index.tsx` 展示页面骨架，components 展示业务区域，hooks 协调状态与副作用，functions 做纯计算；全局 `components/ui` 只放基础按钮、输入框、弹窗和状态提示。

### player 对应的界面

`apis/player` 的四个类一一对应公开账号消息；`objects/player` 只镜像公开资料与响应。`system/session` 管 checking/signed-out/signed-in/unavailable 等有限身份状态、令牌恢复与异步请求竞态；令牌由 `system/api/sessionToken` 存在本标签页 sessionStorage。

Home 先呈现主菜单，Auth 弹窗根据原意图处理登录/注册。确认密码只做前端校验；关闭取消意图，成功后只接续一次。网络不可达与令牌失效分开显示，不把短暂断网误当退出成功。昵称和已登录身份来自后端验证结果。

### training 对应的界面和引擎

`apis/training` 负责读取配置、开局、查局和放弃；`objects/training` 是与 Scala 一致的纯数据及运行时解码。Training 页冻结开局账号、RunId、配置与地形，加载 GameView，资源就绪后由玩家开始三秒倒数。

`pages/Training/game` 管可挂载/销毁的 Three.js 生命周期、合成音效与资源释放；`game/core` 放由原型迁入的地形、控制、扫描、追击、连续碰撞、弹道、爆炸和分级渲染；`threejs/src/game` 通过重导出复用这套核心，避免玩法分叉。它们已经属于正式应用，不通过 iframe 调用 5174。React 只接收 HUD 和终局等少量状态，Scene/Mesh 不进入网络对象或每帧全局 Store。

| 操作 | 行为 |
|---|---|
| W/A/S/D | 沿相机地面方向移动 |
| 空格 | 跳跃，可落在箱体上 |
| 鼠标移动 | 平滑瞄准；超出中央蓝框时渐进转镜头 |
| 左键 / 持续按住 | 发射脉冲，受射速限制 |
| 滚轮 / 镜头按钮 | 调整跟随距离 |
| Esc / 失焦 / 标签页隐藏 | 暂停并清空输入；主动继续后重新倒数 |
| 手机触屏 | 移动摇杆、瞄准区域、射击与跳跃按钮 |

暂停冻结世界、AI、弹丸和有效计时；倒数、菜单和恢复时阻止输入穿透。接触当帧锁定失败并冻结玩法/计时，先显示行动中断，让 1.2 秒爆炸与尾烟完整播放后交付结算；设置或隐藏页面也冻结这段视觉时钟。全清锁定胜利，同一终局只交付一次。重新开始重置四机血量、角色、弹丸与计数。设置里的画质、音量、镜头灵敏度存本机；音效由 Web Audio 合成，不依赖外部爆炸音效文件。

### records 对应的界面

`apis/records` 与成绩消息对应；Result 页可用经过校验的 URL RunId 独立向数据库查询，History 页负责分页、空状态和个人最佳。`system/results` 把终局冻结为 `{playerId,runId,submission}` 后存本机队列，再发送保存。每个账号与局次使用独立 localStorage 键，避免多个标签页互相覆盖，并通过 storage 事件同步。

结算立即显示，不等待网络。保存状态明确为保存中、已保存或尚未保存；重试使用同一 RunId 和同一内容。只有确认成功才移除队列。正式局次入场后认证状态失效会暂停并保留结算，不直接卸载尚未保存的结果。切换账号只提交属于当前账号的项；旧账号记录保留但不转给新账号。网络恢复可重试，仍可以先开始下一局。浏览器清除本地数据会影响尚未成功提交的记录，界面不会把它们冒充数据库成绩。

### 公共 UI 与页面路由

`system/api` 分担请求名称、令牌、HTTP、响应解码与错误；`system/settings` 管本机设置。页面用 Tailwind 表达版式，基础弹窗使用 Radix，游戏 CSS 仅处理画布/HUD/触屏与动画所需样式。美术方向与状态覆盖说明见 [UI 设计说明](docs/UI_DIRECTION.md)。

| 路由 | 用途 |
|---|---|
| `/` | 首页；按需认证弹窗 |
| `/training` | 正式行动；必须取得本人新局次 |
| `/training?practice=1` | 公开自由练习，不保存账号成绩 |
| `/results/:runId` | 本人已保存单局详情，支持直接打开和刷新 |
| `/history` | 本人历史与同地图/规则最佳 |

自由练习入口使用独立模式，配置来自随应用发布、经过运行时解码的 practice-config.json，配置一致性测试核对它与后端初始规则。练习无需 API 提供配置、不申请正式 RunId、不保存账号成绩。刷新或离开正式游戏会中断当前运行；未结束局次不伪造结果，也不能以同 RunId 重新领取完整一局。已结束但暂未保存的结果由队列恢复。

## 素材、渲染与边界

角色和紧凑脉冲枪来自本地程序建模；角色 GLB 保留 Idle/Walk/Aim/Shoot 与 weapon_socket，枪保留 muzzle。角色是本地造型版本，不是下载的官方奶龙模型。环境使用 Quaternius Nature MegaKit，箱桶与无人机来自已整理的 Fantasy/SciFi 素材；来源、许可证与修改见 [正式素材说明](frontend/public/ASSET_CREDITS.md)和[原型素材说明](threejs/ASSET_CREDITS.md)。

地形高度由函数生成，同一高度用于画面与碰撞；山地构成边界，远处保留简化轮廓。植物采用离线 LOD、实例化、视锥筛选和逐渐缩小的远距草，避免把短距离像素丢弃误当自然景深。原型的详细问题与调优历史保留在 [threejs README](threejs/README.md)。

物理与碰撞是适用于此游戏的局部算法，未引入完整刚体引擎。无人机使用简单巡逻/追击与遮挡处理；没有联机同步、公开竞技排名、敌方枪械、完整回放或商业级开放世界。数据库验证归属、幂等和汇总合理性，不能只凭上报数字证明每次命中真实发生。正式应用通过 HTTP 保存个人练习，不把帧位置、Mesh 或 GLB 放入 PostgreSQL。

## 验证与交付

```powershell
# nailong/：真实 PostgreSQL 的后端测试，使用独立 nailong_test。
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/test-backend.ps1

# nailong/frontend/：前端类型、业务边界与生产构建。
npm run typecheck
npm test
npm run build
npm run test:production
npm run preview

# nailong/threejs/：原型玩法/碰撞测试与构建。
npm test
npm run build
```

重点覆盖注册并发、会话过期/撤销、伪造身份、Start/Save 幂等、事务回滚、跨账号隔离、坏 JSON/存储解码、扫描和连续碰撞、暂停恢复、终局去重、生产 API 名称。端到端验收还必须实际完成首页认证、行动、胜/败、写库、刷新历史和失败重试；单纯 build 通过不代表这些行为都已验证。

执行时间、测试数、浏览器截图、实际检查过的流程与未验证项统一见 [VERIFICATION.md](docs/VERIFICATION.md)。[三分钟介绍](docs/DEMO_3_MINUTES.md)按“看见游戏 → 扫描与追击 → 胜负与成绩 → 类型安全链路”组织，演示时只展示该验收记录已确认的行为。


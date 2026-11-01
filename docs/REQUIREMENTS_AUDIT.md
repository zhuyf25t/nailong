# 完整项目需求审计（2026-11-01）

本文件是实施前的需求基线，不是完成声明。依据为用户最新指令、`类型安全 10.29.pdf` 全 10 页、`sample/rules.txt` 全文、项目原 README、前后端 sample 核心代码、单人设想 `decisions.json` 与 PDF 入口流程，以及当前 `threejs` 实现说明。用户最新玩法优先；旧图册里“不要实现/不要改 README”是当时图册任务范围，不能覆盖本次完整开发授权。

## 1. 现有要求的有效与失效部分

| 必须保留 | 最新玩法已替代 | 尚未要求，不扩张范围 |
|---|---|---|
| TypeScript、Vite、Three.js；Scala 3、Cats Effect、http4s、Circe、PostgreSQL | 30 秒固定结束 → 四机全清成功，碰撞爆炸失败 | 多人、房间、WebSocket、实时服务器物理 |
| 注册、登录、退出、会话恢复、账号成绩 | 圆靶补位 → 4 架有血条的扫描无人机 | 公共竞技榜、rating、强反作弊 |
| 首屏游戏主菜单，按需登录，登录后接续原动作 | 一发一靶 → 每机 3 HP、受击高速搜索 | 多武器、技能商店、完整开放世界流式加载 |
| 开局冻结规则、独立 RunId、幂等成绩、历史/同版本最佳 | 旧“不跳跃/不显示框” → 已实现跳跃、可见蓝框和触屏 | 无人机敌方子弹、空中增援，除非之后另行决定 |
| 暂停/失焦冻结、倒数输入隔离、保存失败重试、换号隔离 | 固定无人机 → 移动巡逻、发现追击、接触自爆 | 将 GLB 存入业务数据库 |
| 实际代码文件树在 README 最前，每个文件有 `#` 作用说明 | 旧最高 hits 排序需改为新模式明确的最佳排序 | 为展示“微服务”而独立部署多个后端 |

新增明确交付：无人机移动与追击、自爆效果、玩家失败终局弹窗、整页 UI 美化、完整前后端闭环、三分钟介绍逻辑。先完成前端追击自爆，再按实际效果更新架构并完成全项目。保留 `threejs` 实验区的可运行性；成品源码位置应在主 README 明确，避免两份玩法长期分叉。

## 2. 类型安全与后端结构硬要求

证据：笔记第 1–3 页（不可变、IO、契约）、第 9–10 页（包装 ID、事务、运行时边界）；rules 第 1–38 条；原 README 第 3 节。

- 所有业务服务归 `services/<service>/`。保留 player、training、records；公共基础设施归 `services/system/`。服务目录按实际需要采用 `api/objects/routes/tables/utils`，额外层级解释真实用途，不凑空目录。
- 每个独立业务类型一个文件，Scala 使用 `final case class`，伴生对象放编解码器；普通领域对象不执行数据库、权限校验、随机 ID 生成或 `fromStored` 工作流。有限状态用 enum/密封类型，前端用可辨识联合。
- 重要 ID 区分 `PlayerId`、`SessionId`、`RunId`、`TrainingConfigId`。Scala 包装基础值，前端解析后得到品牌类型；不能用多个 `type X = string` 冒充防混用。网络 ID 为字符串。
- **每个 API 单独文件、消息构造参数是输入、仅一个返回类型：`APIMessage[Response]`，唯一必要执行入口为 `plan(connection: Connection): IO[Response]`。** 没有业务输入用 `NoRequestMessage[Response]`，不造空 Request DTO。
- **不要默认给每个消息/plan 注入 Context、planContext 或请求元数据。** 实际所需身份作为可信构造参数；数据库连接复用同一个显式参数（rules 27）。
- API 可调用任意服务公开 API 的 `plan(connection)`、任意服务公开且封装的 Table 方法、自己服务的 utils。不要加只做转发的 Service 层。跨服务访问并不自动赋予授权。
- utils 函数用 `private[服务名] def`，SQL 值与行映射私有。每表独立文件夹，`XXTable.scala` 与 `XXTableInitializer.scala` 并列。每个私有 `xxxSql` 紧接其公开 `def xxx(...): IO[T]`；调用方不能传任意 SQL 绕过归属。
- API plan 用 IO 顺序组合校验、查询和写入；JDBC 放 `IO.blocking`。业务核心使用 val、不可变值、map/flatMap/for-yield；资源管理在边界。不能在业务 plan 内 `unsafeRunSync` 或自行 commit。
- 外层 DatabaseSession 管完整事务和连接生命周期。一个业务流程的多服务操作共用一条连接，共同提交/回滚；异常、取消时保证语句、结果集、连接释放。
- 路由仅接收、查注册表、解码、认证转换、执行 plan、编码。每服务一个 `XXRoutes.apiMessages`，顶层合并；内部 API 不暴露 HTTP、不建前端镜像。
- API 名按统一类型名规则推导，例如 `LoginPlayerAPIMessage` / `LoginPlayerAPI` → `POST /api/loginplayerapi`。不得页面手写 URL；生产压缩必须仍能得到相同名字（保留 class 名或等价可靠方案，并实测生产产物）。

### 身份与传输边界

- 注册/登录公开；个人操作带 `userToken`。路由调用账号内部验证能力，得到可信 `playerId/sessionId` 后才构造业务消息。**请求体伪造的身份不得覆盖可信身份。** 前端 token 与后端可信身份字段可以不同（rules 28–29）。
- 账号唯一性、会话摘要唯一性和有效期/撤销由数据库及逻辑共同保证。密码用成熟哈希方案；只存密码哈希与令牌摘要。公开 DTO 不泄漏 StoredPlayer/passwordHash/tokenHash。
- 成功响应一个明确 DTO；失败统一 `{code,message}` 和 HTTP 400/401/403/404/409/500；内部错误记录于服务器，不向浏览器泄露异常细节。
- 所有 HTTP 响应、URL 参数、本地存储从 `unknown` 校验；TypeScript `as DTO` 不能取代校验。Scala Circe 解码也须拒绝非法 ID、枚举、非有限/越界数字和错误分支。
- 时间点为带时区 ISO 8601，持续时间毫秒，坐标米；枚举编码及 `kind` 联合分支显式约定。无值为 `null`、空列表为 `[]`，不随意混用缺失与空字符串。

## 3. 完整产品闭环

### player

- 公开 RegisterPlayer、LoginPlayer、GetCurrentPlayer、LogoutPlayer；内部 ResolvePlayerToken。
- 首次打开先看见角色主视觉、开始行动、我的成绩、设置。未登录点行动/成绩才弹账号框；主动登录留在首页，取消则清空待执行动作，认证成功只接续一次。
- 注册确认密码只留前端；成功自动登录。昵称默认账号名，错误保留账号输入。退出撤销当前会话而非所有会话；刷新读取本标签页 sessionStorage token 并校验当前身份。

### training

- 公开 GetTrainingConfig（无请求、公开）、StartTrainingRun、GetTrainingRun、AbandonTrainingRun。
- PostgreSQL 配置按 `(configId,rulesVersion)` 版本保存；每局存冻结快照。新规则增加版本，不能重写旧成绩含义。
- Start 以 `(playerId,requestId)` 唯一约束防重；同输入重试取同 RunId，不同输入冲突；再来一局产生新 requestId。期望规则版本过时需明确冲突并重新准备。
- `open/completed/abandoned` 是持久化生命周期；新 `victory/defeat` 是本局终局结果，不能把所有 completed 自动显示为胜利。
- 游戏引擎运行在前端：移动、跳跃、扫描视线、追击、碰撞、弹道、爆炸、渲染。不得逐帧 HTTP，不建 Shoot/Hit/Scan 数据库接口。记录是客户端上报的个人练习数据，不能声称后端已验证每次 3D 碰撞。
- 新规则包含 4 架/3 HP、扫描角度与距离、巡逻/追击速度、受击搜索时间、碰撞触发距离、武器参数和场地/规则版本。配置必须真正进入游戏，不能后端发一套、前端继续硬编码另一套。
- 正式行动资源加载成功才可开始。准备阶段可不计分探索/试射；正式开始重新建立角色/无人机/弹丸/计数，3 秒倒数后运行。
- 4 架全毁成功；敌机碰到角色播放明确爆炸并立刻终止正常玩法，弹窗显示失败/再来一次/返回。单一终局必须幂等，不能同帧反复弹窗或又胜又败。
- 无人机随机巡逻、约 90° 红色扫描，遮挡与玩家高度参与发现；发现后移动追击。按后续用户补充，未发现或失去视线时受击高速搜索，已锁定且仍能看见玩家时受击继续追击；开局升空，追击时降低高度。移动不能穿山/箱，扫描提示与真实逻辑尽量一致；碰撞应检查连续位移，避免低帧率穿过角色。
- Esc/失焦/标签隐藏冻结计时、AI、弹道、动画与冷却并清空输入；明确继续后倒数，需新按键/新画布鼠标移动恢复。菜单不能点击穿透；卸载清帧循环/监听/资源。
- 手机保留触屏移动、瞄准、射击与跳跃入口；桌面保留 WASD、空格、平滑鼠标瞄准、蓝框外转向、滚轮缩放。

### records

- 公开 SaveTrainingResult、GetTrainingResult、ListMyResults、GetMyBest。数据库查询始终带可信玩家归属。
- 新 DTO 必须包含 `outcome`，并区分 `hits`（有效伤害命中）与 `destroyed`（击毁数）、shotsFired、elapsedMs；不再要求 elapsedMs 恰好 30000。胜利要求 4 击毁，失败也可保存为完成尝试，主动退出是 abandoned。
- 新“最佳”建议明确为**同配置/规则版本下胜利最快**，并列再按命中率/最近时间给出稳定顺序；失败不能刷最快通关。最终排序以 README 与契约一致为准。
- 保存事务：锁定本人 run → 判断完成/放弃 → 校验冻结配置 → 插入唯一 runId 成绩 → 标记 completed → 一起提交。相同 RunId/相同内容幂等返回；同 RunId/不同内容 409；已放弃不能提交。
- 校验非负有限整数、hits≤shots、destroyed 范围、每机 3 HP 对 hits/destroyed 的可行约束、结果和击毁一致、射速/有效用时上界。只能说明汇总合理，不能从汇总证明真实击中。
- 结算立即呈现，保存为 saving/saved/failed；失败不丢分数，不伪称已入库。待保存队列按 playerId+runId 隔离，本地数据也要解码；原账号重登才重试，换号不转移。
- 允许待保存时再开一局；先前结果保留。刷新单局详情用 URL RunId 查询后端；历史处理 loading/empty/ready/error 和分页，不能只读内存演示数据。

## 4. 前端组织与 UI 要求

证据：笔记第 4–10 页；rules 39–60；原 README 5.1–5.4。

- TypeScript + React + Vite。前端按 sample 使用 `src/apis/<service>`、`src/objects/<service>`；文档按服务介绍不等于把前端改成 services 目录。
- 通用 API 设施独立 `system/api`：基类、名称、token、fetch、解码、错误各自职责明确。公开后端消息有前端 API 文件，内部消息除外。
- Home / Training / Result / History 页面 `index.tsx` 明确展示页面区域；页面自己的 components/hooks/functions/objects/stores 就近。hooks 管状态/副作用；functions 纯计算；公共组件仅基础 UI，不创建无真实复用的共享层。
- React 根据不可变状态渲染；组件渲染过程不发请求/写存储。Three.js Mesh/Scene/AnimationMixer 不进跨网络 DTO、不逐帧塞 React store；通过少量 HUD 与终局事件对接。
- Tailwind 为主要样式体系，可用 sample 的 shadcn/Radix 基础组件；CSS 只留必要主题/渲染画布例外。美化整个页面，包括首页、认证、历史、设置、暂停、失败/成功与加载错误态，而非仅调游戏画布。
- 运行时设置（画质、总音量、镜头速度）存本地，真实影响对应效果；没有音源不展示假音量功能。场景资产随前端发布，保留来源/许可文件与必需骨骼/节点验证。
- URL `/`、`/training`、`/results/:runId`、`/history` 或明确等价路由。加载/失败可恢复；刷新/直接打开不凭临时 state；刷新进行中的 action 不恢复同 RunId 无限重新游玩。

## 5. 必须用实际证据验收

1. **架构**：实际文件树与 README 完全相符且文件都有作用注释；按 system/player/training/records 解释 api/objects/routes/tables/utils 与关键类型。移除“只有 README/尚未制作任何 GLB/30 秒靶子”过期断言。
2. **静态类型**：Scala 编译与测试成功；前端 `typecheck` 与 production build 成功。ID 互换的负例不能编译；无裸 JSON 强转逃过业务边界；生产 API 名与开发名一致。
3. **真实数据库**：从空数据库初始化，注册登录、创建局次、终局保存、历史/最佳、退出；重启服务数据仍在。不可只用内存 mock 或测试 fixture 宣称数据库完成。
4. **认证/授权**：过期/撤销 token 拒绝，伪造 playerId/sessionId 无效；另一玩家不能读/存/放弃他人 run。注册并发不会重名；公开响应无秘密字段。
5. **并发/事务**：并发相同 requestId 仅一局；同 key 不同配置冲突；并发同 run 保存只一条；差异提交冲突；插入失败则局次状态不完成；放弃与保存竞争保持一致。
6. **契约**：坏 JSON、非法 UUID/枚举/时间/数字、缺字段/错误联合分支、损坏本地队列明确失败；错误 HTTP 与 code 相符。测试直接覆盖真实 decode/route/DB，而非仅重复类型声明。
7. **游戏**：浏览器可见巡逻→发现→追击→碰撞爆炸→失败弹窗；另一路可击毁 4 架→成功；重开恢复 4×3 HP。实测暂停冻结、菜单不穿透、前后台恢复和低帧率连续接触判定。
8. **闭环浏览器**：从首次首页开始，注册/登录接续挑战，结束写库，历史/详情刷新仍有；离线保存明确待保存，恢复网络重试不重复，换号不串数据。
9. **UI/资源**：桌面与手机尺寸截图、表单键盘操作与错误可读、按钮状态正确；GLB/贴图真实加载无 console 错误；离开/重进无多重循环和监听泄漏。不能以后台截图帧率宣称手机性能。
10. **交付运行**：README 提供实际安装、数据库准备、环境变量、启动、测试/构建、端口与运行入口；示例不含真实秘密；生成的包与源码一致可启动。
11. **三分钟介绍**：提供 180 秒顺序和具体演示动作，含玩法规则、扫描追击/爆炸、类型安全请求到数据库、成绩幂等与保存恢复、当前边界；不把未实现模块作为演示成果。

## 6. sample 必须改进的已确认差异

- `sample/frontend-sample/src/system/api/apiRequest.ts` 使用 `response.json() as Promise<Response>`，错误体也强转；本项目必须运行时解码。
- `sample/frontend-sample/src/system/api/apiNameOf.ts` 使用 `constructor.name`，sample Vite 未保留名字；成品需生产验证。
- `sample/backend-sample/src/main/scala/services/books/tables/book/BookTable.scala` 的方法 `private[books]` 与 rules 允许全后端公开 Table 方法不一致；按最新规则提供公开封装方法。
- sample 全局 `system/`、`routes/` 与最新 rules/原架构的 `services/system` 不同；遵循本项目已声明归属。
- sample `APIMessage.scala` 把多个不相关类型聚合一文件；本项目按每类型一文件组织（伴生对象同文件）。
- sample `APIMessageRouter` 会把内部异常原文返回；本项目内部错误需安全通用文案并服务端记录。
- sample 数据库默认账号/密码是演示配置，不可复制为实际秘密。示例 README 的管理员创建/图书借阅不是本项目功能需求。

审计依据行号（原 README 后续重写后可能变化）：原 README 351–373 目录；425–456 类型/信任/事务；462–604 三服务 API/表；608–685 前端交互/队列/路由；rules 166–249 消息/IO/Context；251–327 身份与注册；341–378 Table；559–640 前端镜像与 Tailwind。笔记第 9–10 页是类型安全与前后端边界的主要依据。

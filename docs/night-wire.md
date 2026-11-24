# 夜班接口 · 回收线

本地客户端以 HTTP 连接 Scala 权威服务器，模拟固定为 20 Hz。坐标为 480 × 288 逻辑像素，玩家活动区是 x=16..464、y=98..267。渲染可以在两个相邻快照之间插值。角色碰撞、接住、投出、签收和解锁都由服务端判定。

## 会话与当班

| 接口 | 请求与结果 |
|---|---|
| GET /health | 返回 status、game、rulesPause 和 storyCampaign。回收线版本为 4 |
| POST /v1/sessions | 昵称 name 和口令 password 换取 token、name。后续请求带 Authorization: Bearer |
| GET /v1/night/profile | unlocked 是可开的最高夜，cleared 是盖过章的夜，bestClean 是一夜中最高的无误签收数 |
| POST /v1/night/start | night 为 1–8，requestId 为 UUID。同一工牌重发同一开班请求只取得同一份回执。锁关返回 409 |
| GET /v1/night/run/{runId} | 返回本人当班快照，内含 runId、ack、tick、phase、player、delivered、story |
| POST /v1/night/run/{runId}/input | 提交 seq、mx、my、ax、ay、action。移动和准星分量为有限的 −1..1，seq 为非负安全整数 |

`catch` 是物理按下，`release` 是松手，`probe` 是弹盖。每个输入边沿保留该时刻的准星与移动量，并按序仅消费一次。`hold` 在亮杆附近扶稳机器，六个 tick 未刷新就释放。`throw` 用于点击剧情机关、面对面递交。余下三种动作为 none、pause、resume。输入队列满时返回可重试的 input_queue_full。手册打开时该局的时钟、来瓶、追击和睡眠环一起冻结。

## 回收线投影

当 `story.relay` 为对象时，玩家正在操作回收线。它既能出现在厂房，也能和地下室铁门、签收廊压辊或守夜窗同时存在。

| 字段 | 玩家能看到什么 |
|---|---|
| leg、stage、tick | 当前工位、运行或签收阶段、该趟时钟 |
| bottles | 瓶号、货瓶或空瓶、所在带/在手/飞行状态、当前坐标、可见轨迹、接瓶点、eta、window、radius、catchable，以及瓶内声音 |
| windows | 窗口编号、位置、开口半宽、当前是否开启、实际发生的截盖或穿掌反应 |
| switch、inlet、rack、pipes | 拨片、回收入带口、补给架和可敲管口的场内坐标 |
| cap、caps、route | 飞盖的真实位置及是否反弹、剩余盖数、当前道岔方向 |
| hunter | 可见追击状态、其位置与锁定目标。扑击前地面会预告 |
| events | 有序事件。id 用来去重，atTick 保留实际模拟节拍，kind、坐标与 slot 描述击管、玻璃响应、接瓶、入带、签收等结果 |

eta 为距接瓶中心时刻的剩余 tick；到达后可以为负。是否能接还取决于与瓶颈的物理距离。不同夜的时间宽度与半径由服务端下发。`sounds` 按序保留 step、pipe、bell 和相邻两声的间隔。客户端不能由快照读到真窗答案；截盖或穿掌属于已经发生的观察。

## 章节与存档

story 的 room、step、stageTick、objective、people、marks、tiles 统一描述房间。cue 与 cueId 驱动一次性字幕和声画同步。第一次完整签收并走到南门后，fourth_bottle 的 fourthSounds 让空瓶按原节奏出声。首夜走位每秒采样五次，连同声音序列在收班时写入 PostgreSQL。旧工牌的已解锁夜数保留；回收线版重玩首夜能给旧的无声录像补上配套走位和声音。

第六夜比较现场、延迟两秒与存档录像。第七夜的 plateTicks 从 0 累加到 40，seal_ready 表示可以封存，第二段回放时有压辊和货槽。sill_wait 的 stand_here 是末闸白线，help_hold 开门 24 tick。第八夜的 round、sleepTicks、sleepMax、braceTicks、braceMax 分别描述守夜轮数、睡眠环和扶稳进度。第二、三轮激活物流时，靠近亮杆的持续按住优先扶稳，松手后可离开操作回收线。服务端判定归零当拍的动作后仍未完成物流时，发出 ward_relay_late，回到本轮的 sleep_reveal。

赢得章节后服务端记录清关并开放下一夜。关卡、输入、工牌、开班请求、对局编号各有自己的 Scala 类型；客户端的成功画面从收到的终态产生。[领域代码](../backend/src/main/scala/soda/night)

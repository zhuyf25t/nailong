# 夜班契约 · 守夜版

项目根是 hw3，Godot 为 game/，运行时 HTTP 与 PostgreSQL 默认使用本机 8738、55439。GET /health 返回 {"status":"ok","game":"nightshift","rulesPause":true,"storyCampaign":2}。POST /v1/sessions 沿用 {name,password} → {token,name}。以下均使用 Authorization: Bearer。

- GET /v1/night/profile → {"unlocked":1,"cleared":[],"bestClean":0}。cleared 是已完成的夜班号数组，bestClean 是同一关最多无误投递数（0–3）。
- POST /v1/night/start，正文 {"night":1,"requestId":"UUID"}，返回下面的快照。新开同一玩家的比赛替换旧比赛，重复 requestId 幂等。锁关 409。
- GET /v1/night/run/{runId} 读取该玩家的快照。POST /v1/night/run/{runId}/input 接受 {"seq":0,"mx":0,"my":0,"ax":0,"ay":-1,"action":"none"}。移动和瞄准是有限的 -1..1 分量。action 支持 none、probe、throw、hold、pause 和 resume。hold 表示本次采样时仍按住鼠标左键，六个 tick 没收到新输入就释放。probe、throw 按输入序号只消费一次。HTTP 400/401/404/409 的正文为 {code,message}。

每秒 20 tick，服务器推进。世界是 480×288 像素。奶龙中心限 x=16..464、y=98..267，初始 (240,220)。收货线 y=78，窗 0/1/2 中心 x=104/240/376，命中半宽 35。开启次序：一窗 [1]，两窗 [0,2]，三窗 [0,1,2]。侧墙 x=12 和 468，可反射一次。撤离路线：先到 (46,220) 或 (434,220) 的指定拉杆（半径 18），再到南门 (240,260) 半径 23。正常 clockout 阶段只需到南门。

```json
{"runId":"27b49745-ff79-4b87-962b-56bf7239dbee","ack":-1,"tick":0,"night":1,"order":1,"phase":"serving","paused":false,"player":{"x":240,"y":220},"windows":[{"slot":1,"actor":"frog","look":"still"}],"memory":"left","probe":"none","probeTicks":0,"pressure":-1,"bank":false,"dim":false,"belt":0,"lever":"left","latched":false,"escapeTicks":0,"bottle":null,"chase":null,"event":"start","eventId":0,"delivered":0,"story":{"step":"delivery","room":"factory","objective":"瞄准上方 2 号窗，点左键。","cue":"warm","cueId":0,"stageTick":0,"tiles":[],"people":[],"marks":[],"round":0,"sleepTicks":0,"sleepMax":0,"braceTicks":0,"braceMax":0}}
```

phase 枚举 serving、escaping、clockout、won、escaped、lost。order 1..3。actor frog/egg，一单各个开窗使用相同伙伴。look still/left/right。memory left/right，probe none/left/right。probeTicks 为此次可见动作剩余 tick。pressure 是剩余 tick，-1 表示不限时。belt -1/0/1，dim、bank 和 latched 为布尔。lever left/right。bottle null 或 {x,y,vx,vy,bounced}，渲染以实际快照为准。event 枚举 start/probe/throw/bounce/miss/blocked/deliver/intruder/lever/escape/lost/clockout/won，eventId 单调。普通送货夜交满进入 clockout，到南门变成 won。故事夜完成各自的出口条件后进入 won。两种方式都会保存通关。客户端永远收不到真假标记。界面根据 phase 与 delivered 呈现成功，即使中间的 event 被跳过也正确。

escaping 阶段 `chase` 是追赶者的实际位置 `{x,y}`，范围为 x=16..464、y=87..267，其余阶段为 null。追赶者先在距玩家最近的营业窗起身 25 tick，再以每 tick 2.2 像素追向玩家。接近至 13 像素会提前被抓。玩家可利用每 tick 4 像素的正常步速绕开它，完成拉杆与离厂。撤离限时和接触捕获分别判定。

当班查看手册发送 pause，快照的 paused 变为 true。这一局的 tick、压力、瓶子和追逐者均冻结，客户端发送 none 保持连接。关闭手册发送 resume，服务器从原状态继续，阅读期间经过的时间不计入游戏。

### 故事与守夜

故事房使用同一个输入接口与 20 Hz 时钟。Scala 将不同房间的合法操作和过关条件保存在各自的状态类型中。网络层只投影玩家能观察到的动作。一、二号角色朝向不同、另一个角色的位置有延迟，都需要从画面推断。

| story 字段 | 含义 |
|---|---|
| room、step、stageTick | 场地、当前操作与该步经过的 tick。场地有 factory、maintenance、signatures、sleepward |
| objective | 当前可以执行的中文目标，供交班票显示 |
| cue、cueId | 字幕、音效与动画共用的事件标记。重复 HTTP 响应不应重播同一次事件 |
| tiles | 地砖中心坐标、solid/warn/hole/mend 及状态剩余 tick |
| people | 画面中可见者的坐标、kind 与展示槽位。睡蛙闭帘时四个窗体外观相同，通过连续坐标追踪 |
| marks | 录制台、踏板、稳机等公开交互位置 |
| round、sleepTicks、sleepMax | 守夜轮数和本轮睡眠环，计时单位为 tick |
| braceTicks、braceMax | 这次扶稳装置已连续按住及需要的 tick |

首夜首次成功打卡时保存一段实际走位。第六夜服务端读取这段轨迹，与实时位置及两秒延迟的轨迹分别生成监控画面。第七夜回放当前录下的脚步并驱动实体门闩。第八夜按服务器轨迹移动四扇窗；玩家在看得见的响应出现后才能交付。通关进度与原工牌共用，旧档可以直接开始已解锁的夜班。

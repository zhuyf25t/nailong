# 夜班契约 v1

项目根是 hw3，Godot 为 game/，运行时 HTTP 与 PostgreSQL 沿用本机 8738、55439。GET /health 返回 {"status":"ok","game":"nightshift","rulesPause":true}。POST /v1/sessions 沿用 {name,password} → {token,name}。以下均使用 Authorization: Bearer。

- GET /v1/night/profile → {"unlocked":1,"cleared":[],"bestClean":0}。cleared 是已完成的夜班号数组，bestClean 是同一关最多无误投递数（0–3）。
- POST /v1/night/start，正文 {"night":1,"requestId":"UUID"}，返回下面的快照。新开同一玩家的比赛替换旧比赛，重复 requestId 幂等。锁关 409。
- GET /v1/night/run/{runId} 读取该玩家的快照。POST /v1/night/run/{runId}/input 接受 {"seq":0,"mx":0,"my":0,"ax":0,"ay":-1,"action":"none"}。移动和瞄准是有限的 -1..1 分量。action 支持 none、probe、throw、pause 和 resume，序号递增，重复序号不会再次触发。HTTP 400/401/404/409 的正文为 {code,message}。

每秒 20 tick，服务器推进。世界是 480×288 像素。奶龙中心限 x=16..464、y=98..267，初始 (240,220)。收货线 y=78，窗 0/1/2 中心 x=104/240/376，命中半宽 35。开启次序：一窗 [1]，两窗 [0,2]，三窗 [0,1,2]。侧墙 x=12 和 468，可反射一次。撤离路线：先到 (46,220) 或 (434,220) 的指定拉杆（半径 18），再到南门 (240,260) 半径 23。正常 clockout 阶段只需到南门。

```json
{"runId":"UUID","ack":-1,"tick":0,"night":1,"order":1,"phase":"serving","paused":false,"player":{"x":240,"y":220},"windows":[{"slot":1,"actor":"frog","look":"still"}],"memory":"left","probe":"none","probeTicks":0,"pressure":-1,"bank":false,"dim":false,"belt":0,"lever":"left","latched":false,"escapeTicks":0,"bottle":null,"chase":null,"event":"start","eventId":0,"delivered":0}
```

phase 枚举 serving、escaping、clockout、won、escaped、lost。order 1..3。actor frog/egg，一单各个开窗使用相同伙伴。look still/left/right。memory left/right，probe none/left/right。probeTicks 为此次可见动作剩余 tick。pressure 是剩余 tick，-1 表示不限时。belt -1/0/1，dim、bank 和 latched 为布尔。lever left/right。bottle null 或 {x,y,vx,vy,bounced}，渲染以实际快照为准。event 枚举 start/probe/throw/bounce/miss/blocked/deliver/intruder/lever/escape/lost/clockout/won，eventId 单调。正常交满进入 clockout，在南门 won 才保存通关。客户端永远收不到真假标记。界面根据 phase 与 delivered 呈现成功，即使中间的 event 被跳过也正确。

escaping 阶段 `chase` 是追赶者的实际位置 `{x,y}`，范围为 x=16..464、y=87..267，其余阶段为 null。追赶者先在距玩家最近的营业窗起身 25 tick，再以每 tick 2.2 像素追向玩家。接近至 13 像素会提前被抓。玩家可利用每 tick 4 像素的正常步速绕开它，完成拉杆与离厂。撤离限时和接触捕获分别判定。

当班查看手册发送 pause，快照的 paused 变为 true。这一局的 tick、压力、瓶子和追逐者均冻结，客户端发送 none 保持连接。关闭手册发送 resume，服务器从原状态继续，阅读期间经过的时间不计入游戏。

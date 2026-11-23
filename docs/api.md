# 对战接口 v1

地址为 `http://127.0.0.1:8737`，UTF-8 JSON。昵称和口令只用于登录；其他路由使用 `Authorization: Bearer <token>`。房间码是六位大写字母或数字，席位是 0–3，显示名由账号决定。Mode 是 `ffa|ctf`，Skin 是 `dragon|egg|frog`。

| 方法与路径 | 请求 | 成功响应 |
|---|---|---|
| GET /health | 无 | `{"status":"ok","game":"soda"}` |
| POST /v1/sessions | `{name,password}`，昵称 1–32 字、口令 8–128 字 | `{token,name}`，首次自动注册，以后校验口令 |
| POST /v1/rooms | `{requestId,mode,skin}` | RoomView |
| POST /v1/rooms/{code}/join | `{requestId,skin}` | RoomView |
| GET /v1/rooms/{code} | 无 | RoomView |
| POST /v1/rooms/{code}/input | `{seq,input}`，input 见模拟协议 | RoomView |
| POST /v1/rooms/{code}/leave | `{}` | `{"left":true}` |
| GET /v1/history | 无 | `{matches:[{matchId,code,mode,skin,score,outcome,endedAt}]}`，最新在前，最多20条；outcome 为 win / loss / draw，endedAt 为 UTC ISO 8601 |

RoomView 为 `{matchId,code,you,ack,seats,state}`。matchId 与请求 requestId 为 UUID 字符串。you 为调用者席号。ack 为该席位最近接受的输入序号，初值 -1。seats 为四个 `{slot,name,skin,human}`。state 为同一服务器 tick 的竞技状态，结构见 [模拟协议](simulation-wire.md)。

客户端每约 50–100 ms 发送当前方向、瞄准与按键样本，同时接收快照；旁路读快照不会推进时钟。seq 从 0 开始，重发相同序号不会重复触发操作。一次性操作在首次发送直到收到确认之间保留。房间创建和加入使用 requestId 防止超时重试时重复建房占位。错误为 `{code,message}`，400 表示字段或范围错误，401 表示身份无效，403 表示无权操作席位，404 表示房间不存在，409 表示房满或比赛状态冲突。

## 从建房到第一步移动

已登录的奶蛙向 `POST /v1/rooms` 发送下列请求体。超时后重发这次建房，应沿用同一个 UUID。下一次新开比赛时生成新的 UUID。

```json
{"requestId":"6d186a87-0a7f-4530-a061-ea838d20dd0f","mode":"ctf","skin":"frog"}
```

从响应中读出 `code` 与 `you`，把房码交给朋友。第二位玩家拿自己的 token 调用 join，传入自己的 `requestId` 和 `skin`。以下是第一位玩家向 `POST /v1/rooms/{code}/input` 发出的完整请求体，表示向右走、向上瞄准并发射奶泡。

```json
{"seq":0,"input":{"moveX":1,"moveY":0,"aimX":0,"aimY":-1,"fire":true,"weapon":0,"reload":false,"dash":false,"shield":false}}
```

收到 `ack: 0` 表示服务器已接受该输入。空间变化在之后的 20 Hz 模拟 tick 中发生。约 300 毫秒没有新输入时释放持续动作，8 秒没有活动时由 AI 接手。房满时返回 409 与 `room_full`；使用同一请求编号提交另一种建房配置时返回 409 与 `request_id_conflict`。

玩家在终局读取 `state.result`，再请求 `/v1/history`。历史中的 `matchId` 对应这场比赛，`score` 记录本人控制席位期间的击破数，`outcome` 记录所在一方或个人的最终胜负。已存成绩的房间快照保留约五分钟，账号、未过期会话与成绩保存在 PostgreSQL。进行中的世界在重启服务时释放。

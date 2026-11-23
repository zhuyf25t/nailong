# 模拟协议 v1

世界使用 480×288 像素坐标，左上为原点。所有时间是整数 tick，20 tick 等于 1 秒。角色大小与模型装饰碰撞无关，碰撞半径为 5 像素。服务器读写同一份地图，输入解码成功后才会进入纯函数模拟。

## 玩家意图

房间层提供顺序号与会话验证，将以下字段转换成 `Controls`。移动向量与瞄准方向的各分量取 -1..1 有限数；对角输入会正规化，零瞄准沿用上次方向。fire 为持续按住，其余三个布尔动作为按下瞬间的边沿。

```json
{"moveX":0,"moveY":-1,"aimX":1,"aimY":0,"fire":true,"weapon":0,"reload":false,"dash":false,"shield":false}
```

发射器 0 奶泡、1 糖星、2 珍珠。弹匣容量 12 / 4 / 3，分别发射 1 / 3 / 1 颗，单颗伤害 14 / 11 / 38，发射间隔 5 / 12 / 17 tick。装填 20 / 28 / 32 tick；空匣持续开火会自动装填。短跳 20 像素，冷却 60 tick；糖壳持续 30 tick，减伤 70%，冷却 160 tick。复活等待 40 tick，出生保护 25 tick；奶瓶加 40 生命，200 tick 后刷新。每局 2400 tick。

## 权威状态

`Wire.state(world)` 产生下列 JSON 对象；房间接口负责外层身份、房间码、在线玩家以及各席昵称、皮肤和控制者。字段不可缺省，下列可空值均显式传 null。

```json
{
  "tick":0, "remainingTicks":2400, "mode":"ctf",
  "fighters":[{"seat":0,"team":"mint","x":40.0,"y":40.0,"aimX":1.0,"aimY":0.0,"hp":100,"respawnTicks":0,"invulnTicks":25,"shieldTicks":0,"shieldCd":0,"dashCd":0,"weapon":0,"ammo":[12,4,3],"reloadTicks":0,"kills":0,"deaths":0,"carrying":null}],
  "shots":[{"id":16,"owner":0,"x":50.0,"y":40.0,"dx":6.0,"dy":0.0,"weapon":0}],
  "pickups":[{"x":120.0,"y":40.0,"cooldown":0}],
  "flags":[{"team":"mint","x":40.0,"y":40.0,"carrier":null}],
  "scores":{"mint":0,"berry":0},
  "events":[{"id":256,"tick":1,"kind":"fire","seat":0,"x":40.0,"y":40.0,"target":null}],
  "result":null
}
```

- fighters 始终有 4 项，按 seat 0..3 排列。0、2 是 mint，1、3 是 berry。hp 为 0..100，死亡时为 0；respawnTicks>0 表示等待复活。输入、得分、能力均使用席位标识。carrying 指携带的旗色。
- shots 的 dx、dy 为每 tick 的位移；shots[].weapon 与 fighters[].weapon 都是 0..2 的整数。弹匣数组始终有三个整数。reloadTicks 是当前选中发射器的装填剩余时间。
- FFA 的 flags 为空，CTF 恰有两旗。carrier 为席号或 null，旗的 x、y 指当前实际位置。补给可用时 cooldown=0。
- events 是最近 20 tick 的短时事件窗口，以 id 去重。种类有 fire、hit、pop、respawn、dash、shield、heal、take、return、capture、reload。hit/pop 的 seat 为攻击方，target 为受击席；其他事件 seat 为动作发起者。
- 结束前 result=null。结束后为 `{"kind":"player","seat":2,"team":null}`、`{"kind":"team","seat":null,"team":"mint"}` 或 `{"kind":"draw","seat":null,"team":null}`。终局后不再推进。最终 tick 可能小于 2400。

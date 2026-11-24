# 不连续的存在

一款用方向键探索、用瞬移穿过机关的像素游戏。按下 X 后，角色会沿当前朝向瞬移一段固定距离，落在目标格的中央。

[观看三分钟初玩实况（MP4）](https://github.com/zhuyf25t/nailong/blob/main/docs/demo.mp4)

## 在 Windows 上运行

1. 准备 Godot 4（本项目使用 4.7.2）、JDK 21、sbt 和 PostgreSQL。将 `sbt.bat` 加入 PATH，并将 `JAVA_HOME` 指向 JDK 安装目录。
2. 将环境变量 `GODOT_BIN` 指向 Godot 的可执行文件。若 PostgreSQL 装在自定义位置，将 `SODA_PG_BIN` 指向包含 `pg_ctl.exe` 和 `initdb.exe` 的目录。
3. 双击 `play.cmd`。首次启动会获取 Scala 依赖、初始化本地数据库并导入游戏素材。出现标题画面后按 C 开始。

方向键移动，C 阅读或交互，X 瞬移。关闭游戏后可在 PowerShell 运行 `.\stop.ps1` 停止本地服务。

## 源码

`game/` 包含 Godot 场景、脚本、美术和音效。`backend/` 包含 Scala 游戏规则、关卡、HTTP 服务和测试。在项目根目录运行 `.\backend\build.ps1` 可执行后端测试，运行 `.\play.ps1 -SmokeTest` 可执行客户端通关测试。

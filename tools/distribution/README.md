# Windows x64 离线包

发行 ZIP 只有一个顶层目录。完整解压后双击 `Play.cmd`。启动器先建立并启动本机 PostgreSQL，等待 Scala 服务报告就绪，再打开 Godot。退出游戏时，启动器依次关闭 JVM 和数据库，保留账号与通关进度。网络服务只监听回环地址。

| 文件或目录 | 用途 |
|---|---|
| `app/nightshift.pck` | 导入后打包的主场景、夜班脚本、人物、工厂、道具与声音 |
| `app/engine/NightShift.exe` | Godot 4.7.2 官方 Windows x64 可执行文件，以 `--main-pack` 进入游戏 |
| `app/server/lib` | 最新编译的 Scala 游戏服务 JAR 及 Maven 运行依赖 |
| `app/java` | 由 Java 21 的 jlink 生成的本机运行时 |
| `app/postgres` | 私有 PostgreSQL 服务、初始化工具、DLL 和空库模板 |
| `app/licenses` | 引擎及其第三方库、Java 组件与数据库的版本和许可资料 |

首次运行会在 `%LOCALAPPDATA%\OnlyThreeOnShift` 创建独立存档，使用 18737 和 55438 两个端口。专用验证入口在其独立的 `verification` 子目录创建测试进度。

## 重建

Windows 机器需装有 Python 3.11+、Godot 4.7.2 x64、Temurin JDK 21、sbt 和 PostgreSQL。默认路径与课程机器一致。代码可在仓库根目录运行。

```powershell
py -3 tools/distribution/build.py
```

其他安装路径可以显式指定。脚本运行 sbt 的 `prepareLaunch`，从依赖缓存取运行所需 JAR，再从单独的夜班资源目录导出 PCK。新的机器第一次构建需能下载 Maven 依赖；玩家使用的成品可在断网状态运行。

```powershell
py -3 tools/distribution/build.py --jdk C:\Tools\jdk-21 --godot C:\Tools\Godot.exe --postgres C:\Tools\PostgreSQL --output C:\Build\NightShift
```

在课程工作区，输出位于 `output/night-shift`，文件名为 `Only-Three-on-Shift-Windows-x64.zip`。同目录的 `.sha256` 文件可与 `Get-FileHash` 的结果比对。已由同一源码执行过 `prepareLaunch` 时可加 `--use-compiled`。在解压目录运行以下两次验收。第一次从登录、名册进入独立的首次规则页，检查四页规则、首单瞄准提示、局内打开手册时服务器冻结、三次投递与解锁。第二次核对上回的通关记录并重新完成第一夜。测试使用专用 Godot 设置目录，玩家的手册已读标记保存在自己的设置中。

```powershell
.\Play.cmd -QuickCheck
.\Play.cmd -QuickCheck
```

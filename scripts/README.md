# 本地后端运行环境

本项目使用真正的 PostgreSQL。`start-database.ps1` 复用已安装的 PostgreSQL 二进制，数据与凭据只保存在本项目中，不修改已有系统服务。

完整应用的一键启动：前端依赖已安装后，从 `nailong` 目录运行 `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/start-app.ps1`，打开 `http://127.0.0.1:5173/`。该命令检查依赖、启动/复用本项目 PostgreSQL、编译并启动 Scala API（8080），最后启动 Vite（5173）。重复执行复用本项目进程；发现其他进程占用端口会报错，绝不终止未知进程。`stop-app.ps1` 只停止状态文件确认属于本项目的进程，保留数据库和已有 5174 原型预览。

进程身份由 PID、可执行文件路径和精确 UTC 启动时间共同核验。运行状态 JSON 一律显式按 UTF-8 读取，支持 PowerShell 7 写入的无 BOM 中文路径文件由 Windows PowerShell 5 读取。脚本同时兼容两个版本的 JSON 日期解析差异，不依赖本地区域日期格式，也不使用时间容差放宽核验。整栈停启已验证：5173、8080、项目数据库端口先释放再恢复，原 5174 与系统 PostgreSQL 服务持续运行。

```powershell
# 从 nailong 目录执行；首次生成随机密码的 .env，不要提交该文件。
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/setup-java.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/start-database.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/start-backend.ps1

# 后台启动与日志
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/start-backend.ps1 -Background
Get-Content .local/backend.stdout.log -Tail 30

# 测试使用隔离的 nailong_test 数据库。
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/test-backend.ps1

# 只停止本项目实例；保留数据库数据。
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/stop-backend.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/stop-database.ps1
```

数据库默认监听 `127.0.0.1:55432`。首次启动时如果端口被占用，会在 55432–55532 范围选择空闲端口并写入 `.env`；之后保持相同端口，不会终止其他占用端口的进程。应用角色为 `nailong`（非超级用户），拥有 `nailong` 与 `nailong_test` 两个数据库。认证使用 SCRAM-SHA-256。管理员凭据单独保存在 `.local/database-admin.env`。脚本不会打印密码。

PostgreSQL 二进制查找顺序：脚本 `-PgBin` 参数、`NAILONG_PG_BIN`、`.tools/postgresql/bin`、本机已有安装。可从 [PostgreSQL 官方 Windows 下载页](https://www.postgresql.org/download/windows/) 获取安装程序或 EnterpriseDB ZIP。

Java 优先使用项目 `.tools/jdk-21`，否则使用 `JAVA_HOME` / PATH。sbt 优先使用已有安装，否则可把官方 launcher 放在 `.tools/sbt/sbt-launch.jar`。依赖缓存和 sbt 启动缓存都放在 `.tools` 中；仓库使用 Maven Central 官方域名。当前本机项目 JDK 来自 [Eclipse Adoptium Temurin](https://adoptium.net/temurin/releases/?version=21&os=windows&arch=x64)，下载后按官方 API 返回的 SHA-256 校验。脚本只修改当前进程环境变量。

Windows 的受限执行沙箱可能不允许 `pg_ctl` 创建受限令牌。此时应在普通 PowerShell 终端运行同一脚本，或允许工具启动项目数据库；不要改为管理员系统服务，也不要改为内存数据库。

后台 API 先执行 `compile` 并导出 sbt runtime classpath，再直接运行 `services.system.Main`。服务运行期间不占用 sbt 项目锁，因而可以同时运行数据库隔离测试；前台 `start-backend.ps1` 仍使用常规 `sbt run`。

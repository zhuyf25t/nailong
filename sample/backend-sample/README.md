# library backend

Scala 3 + Cats Effect + http4s + Circe + JDBC/PostgreSQL 的图书馆借书系统后端。

## 目录结构

- `src/main/scala/Main.scala`: 主程序，启动 http4s 服务并初始化数据库表
- `src/main/scala/routes`: 系统级总路由和健康检查
- `src/main/scala/system`: 数据库连接池、事务、通用错误对象等系统基础代码
- `src/main/scala/system/api`: APIMessage 通用分发器和基类
- `src/main/scala/services/user`: 用户微服务，包含 `api`、`objects`、`tables`
- `src/main/scala/services/books`: 图书微服务，包含 `api`、`objects`、`tables`

## 运行

```bash
sbt run
```

默认监听：

- `http://0.0.0.0:8080`

如果 8080 被占用，可以用环境变量改端口：

```bash
HTTP_PORT=8081 sbt run
```

数据库默认连接：

- `host = 127.0.0.1`
- `port = 5432`
- `databaseName = 当前项目目录名，把 '-' 自动转成 '_'`
- 用户名：`db`
- 密码：`root`

也可以通过环境变量覆盖：

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_MAX_POOL_SIZE`
- `DB_CONNECTION_TIMEOUT_MS`

启动时会自动创建：

- `library_users`
- `library_user_sessions`
- `books`
- `borrow_records`

如果 `books` 表为空，会插入几条示例图书。

## API

### 健康检查

```bash
curl http://127.0.0.1:8080/api/health
```

### 注册管理员

```bash
curl -X POST http://127.0.0.1:8080/api/registeruserapi \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin@123","role":"admin"}'
```

### 登录

```bash
curl -X POST http://127.0.0.1:8080/api/loginuserapi \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin@123"}'
```

后续需要登录的接口在 JSON body 中显式传入：

```bash
"userToken": "<token>"
```

### 图书

```bash
curl -X POST http://127.0.0.1:8080/api/listbooksapi \
  -H 'Content-Type: application/json' \
  -d '{"keyword":""}'

curl -X POST http://127.0.0.1:8080/api/createbookapi \
  -H 'Content-Type: application/json' \
  -d '{"userToken":"<token>","title":"数据库系统概念","author":"Abraham Silberschatz","isbn":"9787111375296","category":"computer","stock":3,"summary":"数据库系统教材。"}'
```

### 借书和还书

```bash
curl -X POST http://127.0.0.1:8080/api/borrowbookapi \
  -H 'Content-Type: application/json' \
  -d '{"userToken":"<token>","bookId":"<bookId>","readerName":"张三"}'

curl -X POST http://127.0.0.1:8080/api/returnborrowrecordapi \
  -H 'Content-Type: application/json' \
  -d '{"userToken":"<token>","recordId":"<recordId>"}'
```

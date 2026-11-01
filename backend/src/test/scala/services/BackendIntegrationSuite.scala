package services

import cats.effect.{Deferred, IO, Resource}
import cats.syntax.all.*
import io.circe.{Json, parser}
import munit.CatsEffectSuite
import org.http4s.{Method, Request, Status, Uri}
import services.system.{DatabaseInitializer, DatabaseSession}
import services.system.objects.DatabaseConfig
import services.system.routes.ApiRouter
import java.sql.Connection
import java.util.UUID
import scala.compiletime.testing.typeChecks
import scala.concurrent.duration.*
import scala.util.Using

/** These are real HTTP-app + PostgreSQL tests, not mocked plans or in-memory repositories.
  * Every test owns its accounts. No shared table is truncated, and production DBs are refused.
  */
class BackendIntegrationSuite extends CatsEffectSuite:
  override val munitTimeout: FiniteDuration = 90.seconds

  private val database = ResourceSuiteLocalFixture("isolated-postgres", for
    config <- Resource.eval(IO {
      val value = DatabaseConfig.fromEnvironment
      require(value.databaseName.endsWith("_test"), "Backend integration tests require DB_NAME ending in _test")
      value
    })
    db <- DatabaseSession.resource(config)
    _ <- Resource.eval(db.transaction(DatabaseInitializer.initialize))
  yield db)

  override def munitFixtures = List(database)

  private case class Reply(status: Status, body: Json)
  private case class Account(id: String, username: String, token: String)
  private val password = "Testing_password_123"
  private def uniqueName: String = "test_" + UUID.randomUUID().toString.replace("-", "").take(18)
  private def uuid: String = UUID.randomUUID().toString
  private def str(value: String): Json = Json.fromString(value)
  private def field(json: Json, name: String): Json = json.hcursor.downField(name).focus.getOrElse(fail(s"Missing field: $name in $json"))
  private def string(json: Json, name: String): String = field(json, name).asString.getOrElse(fail(s"Not a string: $name"))
  private def number(json: Json, name: String): Int = field(json, name).asNumber.flatMap(_.toInt).getOrElse(fail(s"Not an integer: $name"))
  private def auth(account: Account, body: Json = Json.obj()): Json = body.deepMerge(Json.obj("userToken" -> str(account.token)))
  private def request(name: String, body: Json = Json.obj()): IO[Reply] = rawRequest(name, body.noSpaces)
  private def rawRequest(name: String, body: String): IO[Reply] =
    ApiRouter.httpApp(database())(Request[IO](Method.POST, Uri.unsafeFromString(s"/api/$name")).withEntity(body))
      .flatMap(response => response.as[String].flatMap(text => IO.fromEither(parser.parse(text)).map(Reply(response.status, _))))
  private def ok(reply: Reply): Json =
    assertEquals(reply.status, Status.Ok, reply.body.noSpaces)
    reply.body
  private def error(reply: Reply, status: Status, code: String): Unit =
    assertEquals(reply.status, status, reply.body.noSpaces)
    assertEquals(string(reply.body, "code"), code)
    assert(field(reply.body, "message").asString.exists(_.nonEmpty))
    assertEquals(reply.body.asObject.get.keys.toSet, Set("code", "message"))
  private def register(name: String = uniqueName): IO[Account] =
    request("registerplayerapi", Json.obj("username" -> str(name), "password" -> str(password), "nickname" -> str("训练员"))).map { reply =>
      val json = ok(reply)
      val player = field(json, "player")
      Account(string(player, "id"), string(player, "username"), string(json, "userToken"))
    }
  private def config: IO[Json] = request("gettrainingconfigapi").map(ok)
  private def startPayload(cfg: Json, requestId: String = uuid, terrain: Option[Json] = None): Json = Json.obj(
    "requestId" -> str(requestId), "configId" -> field(cfg, "id"), "configVersion" -> field(cfg, "version"),
    "terrain" -> terrain.getOrElse(field(cfg, "terrain")))
  private def start(account: Account, cfg: Json, terrain: Option[Json] = None): IO[Json] =
    request("starttrainingrunapi", auth(account, startPayload(cfg, terrain = terrain))).map(ok)
  private def runPayload(run: Json): Json = Json.obj("runId" -> field(run, "id"))
  private def victory(cfg: Json, elapsed: Long = 10000L, misses: Int = 0): Json =
    val drones = field(cfg, "drones")
    val count = field(drones, "spawns").asArray.get.length
    val hits = count * number(drones, "maxHp")
    Json.obj("outcome" -> str("victory"), "shotsFired" -> Json.fromInt(hits + misses), "hits" -> Json.fromInt(hits),
      "destroyed" -> Json.fromInt(count), "elapsedMs" -> Json.fromLong(elapsed))
  private val defeat = Json.obj("outcome" -> str("defeat"), "shotsFired" -> Json.fromInt(1), "hits" -> Json.fromInt(0),
    "destroyed" -> Json.fromInt(0), "elapsedMs" -> Json.fromLong(1000))
  private def save(account: Account, run: Json, submission: Json): IO[Reply] =
    request("savetrainingresultapi", auth(account, runPayload(run).deepMerge(Json.obj("submission" -> submission))))
  private def execute(connection: Connection, sql: String, arguments: String*): IO[Int] = IO.blocking {
    Using.resource(connection.prepareStatement(sql)) { statement =>
      arguments.zipWithIndex.foreach { case (value, index) => statement.setString(index + 1, value) }
      statement.executeUpdate()
    }
  }
  private def sql(sql: String, arguments: String*): IO[Int] = database().transaction(connection => execute(connection, sql, arguments*))
  private def queryStrings(query: String, arguments: String*): IO[List[List[String]]] = database().transaction(connection => IO.blocking {
    Using.resource(connection.prepareStatement(query)) { statement =>
      arguments.zipWithIndex.foreach { case (value, index) => statement.setString(index + 1, value) }
      Using.resource(statement.executeQuery()) { result =>
        val rows = List.newBuilder[List[String]]
        while result.next() do rows += (1 to result.getMetaData.getColumnCount).map(result.getString).toList
        rows.result()
      }
    }
  })

  test("distinct domain IDs cannot be interchanged at compile time") {
    assert(!typeChecks("""val player = services.player.objects.PlayerId(java.util.UUID.randomUUID()); val run: services.training.objects.RunId = player"""))
    assert(!typeChecks("""val run = services.training.objects.RunId(java.util.UUID.randomUUID()); val config: services.training.objects.TrainingConfigId = run"""))
  }

  test("health and public config work without a session; internal authentication is not exposed") {
    for
      health <- ApiRouter.httpApp(database())(Request[IO](Method.GET, Uri.unsafeFromString("/api/health")))
      cfg <- config
      internal <- request("resolveplayertokenapi", Json.obj("token" -> str("x" * 43)))
    yield
      assertEquals(health.status, Status.Ok)
      assertEquals(string(cfg, "id"), "c8137000-0000-4000-8000-000000000001")
      assertEquals(string(cfg, "version"), "drone-hunt-v2")
      assertEquals(field(field(cfg, "drones"), "spawns").asArray.get.size, 4)
      error(internal, Status.NotFound, "not_found")
  }

  test("registration normalizes username; current-player response has only public fields") {
    val name = uniqueName
    for
      account <- register("  " + name.toUpperCase + "  ")
      current <- request("getcurrentplayerapi", auth(account))
    yield
      assertEquals(account.username, name)
      assertEquals(account.token.length, 43)
      assertEquals(string(ok(current), "id"), account.id)
      assertEquals(ok(current).asObject.get.keys.toSet, Set("id", "username", "nickname", "createdAt"))
  }

  test("passwords and raw session tokens never persist in stored credential fields") {
    for
      account <- register()
      rows <- queryStrings("SELECT p.password_hash,p.password_salt,s.token_hash FROM players p JOIN player_sessions s ON s.player_id=p.id WHERE p.id=?::uuid", account.id)
    yield
      assertEquals(rows.size, 1)
      val row = rows.head
      assertEquals(row(0).length, 64)
      assertEquals(row(1).length, 32)
      assertEquals(row(2).length, 64)
      assert(!row.contains(password))
      assert(!row.contains(account.token))
  }

  test("simultaneous normalized registrations yield exactly one account") {
    val name = uniqueName
    val body = Json.obj("username" -> str(name), "password" -> str(password), "nickname" -> str("唯一玩家"))
    for
      replies <- List(body, body.deepMerge(Json.obj("username" -> str(" " + name.toUpperCase + " ")))).parTraverse(request("registerplayerapi", _))
      rows <- queryStrings("SELECT id FROM players WHERE username=?", name)
    yield
      assertEquals(replies.count(_.status == Status.Ok), 1)
      assertEquals(replies.count(_.status == Status.Conflict), 1)
      assertEquals(rows.size, 1)
  }

  test("login verifies password, normalizes username, and returns a fresh revocable session") {
    for
      account <- register()
      bad <- request("loginplayerapi", Json.obj("username" -> str(account.username), "password" -> str("wrong_password")))
      missing <- request("loginplayerapi", Json.obj("username" -> str(uniqueName), "password" -> str("wrong_password")))
      login <- request("loginplayerapi", Json.obj("username" -> str(" " + account.username.toUpperCase + " "), "password" -> str(password)))
    yield
      error(bad, Status.Unauthorized, "unauthorized")
      assertEquals(bad.body, missing.body, "Unknown user must not be distinguished from an incorrect password")
      assertEquals(string(field(ok(login), "player"), "id"), account.id)
      assertNotEquals(string(ok(login), "userToken"), account.token)
  }

  test("logout revokes only the current session") {
    for
      account <- register()
      login <- request("loginplayerapi", Json.obj("username" -> str(account.username), "password" -> str(password)))
      other = account.copy(token = string(ok(login), "userToken"))
      logout <- request("logoutplayerapi", auth(account))
      old <- request("getcurrentplayerapi", auth(account))
      stillValid <- request("getcurrentplayerapi", auth(other))
    yield
      assertEquals(field(ok(logout), "loggedOut"), Json.True)
      error(old, Status.Unauthorized, "unauthorized")
      assertEquals(string(ok(stillValid), "id"), account.id)
  }

  test("expired and explicitly revoked sessions are rejected") {
    for
      expired <- register()
      revoked <- register()
      _ <- sql("UPDATE player_sessions SET created_at=NOW()-INTERVAL '2 days',expires_at=NOW()-INTERVAL '1 day' WHERE player_id=?::uuid", expired.id)
      _ <- sql("UPDATE player_sessions SET revoked_at=NOW() WHERE player_id=?::uuid", revoked.id)
      replies <- List(expired, revoked).traverse(account => request("getcurrentplayerapi", auth(account)))
    yield replies.foreach(error(_, Status.Unauthorized, "unauthorized"))
  }

  test("all protected APIs reject absent or malformed session tokens") {
    val endpoints = List("getcurrentplayerapi", "logoutplayerapi", "starttrainingrunapi", "gettrainingrunapi", "abandontrainingrunapi",
      "savetrainingresultapi", "gettrainingresultapi", "listmyresultsapi", "getmybestapi")
    for
      missing <- endpoints.traverse(request(_))
      malformed <- endpoints.traverse(name => request(name, Json.obj("userToken" -> str("forged-token"))))
      invented <- endpoints.traverse(name => request(name, Json.obj("userToken" -> str("x" * 43))))
    yield (missing ++ malformed ++ invented).foreach(error(_, Status.Unauthorized, "unauthorized"))
  }

  test("caller-supplied playerId and sessionId cannot override server identity") {
    for
      account <- register()
      replies <- List("playerId", "sessionId").traverse(key => request("getcurrentplayerapi", auth(account, Json.obj(key -> str(uuid)))))
    yield replies.foreach(error(_, Status.BadRequest, "validation_error"))
  }

  test("malformed JSON, arrays, null, oversized body and unknown API have stable errors") {
    for
      invalid <- List("{", "null", "[]", "1", "\"string\"").traverse(rawRequest("gettrainingconfigapi", _))
      large <- rawRequest("registerplayerapi", "{\"padding\":\"" + ("a" * 16385) + "\"}")
      unknown <- request("definitelynotanapi")
    yield
      (invalid :+ large).foreach(error(_, Status.BadRequest, "validation_error"))
      error(unknown, Status.NotFound, "not_found")
  }

  test("registration rejects missing fields, wrong types and unsafe field sizes") {
    val valid = Json.obj("username" -> str(uniqueName), "password" -> str(password), "nickname" -> str("玩家"))
    val invalid = List(Json.obj(), valid.mapObject(_.remove("password")), valid.deepMerge(Json.obj("username" -> Json.fromInt(123))),
      valid.deepMerge(Json.obj("username" -> str("a"))), valid.deepMerge(Json.obj("username" -> str("名字非法"))),
      valid.deepMerge(Json.obj("password" -> str("short"))), valid.deepMerge(Json.obj("password" -> str("a" * 2048))),
      valid.deepMerge(Json.obj("nickname" -> str(" "))), valid.deepMerge(Json.obj("nickname" -> str("x" * 25))))
    invalid.traverse(request("registerplayerapi", _)).map(_.foreach(error(_, Status.BadRequest, "validation_error")))
  }

  test("invalid UTF-8 bytes are rejected instead of silently replacing a credential character") {
    val bytes = "{\"nickname\":\"".getBytes(java.nio.charset.StandardCharsets.UTF_8).toVector ++
      Vector(0xc3.toByte, 0x28.toByte) ++ "\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8).toVector
    val invalid = Request[IO](Method.POST, Uri.unsafeFromString("/api/registerplayerapi"))
      .withBodyStream(fs2.Stream.emits(bytes).covary[IO])
    ApiRouter.httpApp(database())(invalid).flatMap(response =>
      response.as[String].flatMap(text => IO.fromEither(parser.parse(text))).map(json =>
        error(Reply(response.status, json), Status.BadRequest, "validation_error")
      )
    )
  }

  test("start captures owner, configuration and custom terrain, then retrieves the same run") {
    for
      account <- register()
      cfg <- config
      terrain = field(cfg, "terrain").deepMerge(Json.obj("hillHeight" -> Json.fromInt(4), "hillX" -> Json.fromInt(-8)))
      run <- start(account, cfg, Some(terrain))
      fetched <- request("gettrainingrunapi", auth(account, runPayload(run)))
    yield
      assertEquals(string(run, "playerId"), account.id)
      assertEquals(field(run, "config"), cfg)
      assertEquals(field(run, "terrain"), terrain)
      assertEquals(string(run, "status"), "open")
      assertEquals(field(run, "completedAt"), Json.Null)
      assertEquals(ok(fetched), run)
  }

  test("concurrent start retries for one idempotency key return exactly one run") {
    for
      account <- register()
      cfg <- config
      payload = auth(account, startPayload(cfg))
      replies <- List.fill(4)(payload).parTraverse(request("starttrainingrunapi", _))
      ids = replies.map(reply => string(ok(reply), "id"))
      rows <- queryStrings("SELECT id FROM training_runs WHERE player_id=?::uuid", account.id)
    yield
      assertEquals(ids.distinct.size, 1)
      assertEquals(rows.size, 1)
  }

  test("idempotency keys are scoped to accounts and reject changed start inputs") {
    for
      first <- register()
      second <- register()
      cfg <- config
      payload = startPayload(cfg)
      runA <- request("starttrainingrunapi", auth(first, payload))
      runB <- request("starttrainingrunapi", auth(second, payload))
      changed = payload.deepMerge(Json.obj("terrain" -> field(cfg, "terrain").deepMerge(Json.obj("hillHeight" -> Json.fromDoubleOrNull(3.7)))))
      conflict <- request("starttrainingrunapi", auth(first, changed))
    yield
      assertNotEquals(string(ok(runA), "id"), string(ok(runB), "id"))
      error(conflict, Status.Conflict, "conflict")
  }

  test("stale configurations and malformed UUID, missing or non-finite terrain are rejected") {
    for
      account <- register()
      cfg <- config
      payload = startPayload(cfg)
      stale <- request("starttrainingrunapi", auth(account, payload.deepMerge(Json.obj("configVersion" -> str("obsolete")))))
      bad <- List(
        payload.deepMerge(Json.obj("requestId" -> str("not-a-uuid"))),
        payload.deepMerge(Json.obj("configId" -> str("1-1-1-1-1"))),
        payload.mapObject(_.add("terrain", field(cfg, "terrain").mapObject(_.remove("hillWidth")))),
        payload.deepMerge(Json.obj("terrain" -> field(cfg, "terrain").deepMerge(Json.obj("hillHeight" -> Json.fromInt(5))))),
        payload.deepMerge(Json.obj("terrain" -> field(cfg, "terrain").deepMerge(Json.obj("ripple" -> str("NaN"))))),
        payload.deepMerge(Json.obj("terrain" -> field(cfg, "terrain").deepMerge(Json.obj("hillX" -> parser.parse("1e309").toOption.get))))
      ).traverse(body => request("starttrainingrunapi", auth(account, body)))
    yield
      error(stale, Status.Conflict, "conflict")
      bad.foreach(error(_, Status.BadRequest, "validation_error"))
  }

  test("other accounts cannot read, save, look up, or abandon an owned run") {
    for
      owner <- register()
      intruder <- register()
      cfg <- config
      run <- start(owner, cfg)
      reads <- List("gettrainingrunapi", "gettrainingresultapi", "abandontrainingrunapi").traverse(name => request(name, auth(intruder, runPayload(run))))
      write <- save(intruder, run, victory(cfg))
      stillOpen <- request("gettrainingrunapi", auth(owner, runPayload(run)))
    yield
      (reads :+ write).foreach { reply =>
        assert(Set(Status.Forbidden, Status.NotFound).contains(reply.status), reply.body.noSpaces)
        assert(Set("forbidden", "not_found").contains(string(reply.body, "code")))
      }
      assertEquals(string(ok(stillOpen), "status"), "open")
  }

  test("run identifiers require a complete UUID; valid but nonexistent identifiers return not found") {
    for
      account <- register()
      malformed <- List("gettrainingrunapi", "gettrainingresultapi", "abandontrainingrunapi").flatTraverse { name =>
        List(Json.obj(), Json.obj("runId" -> str("1-1-1-1-1")), Json.obj("runId" -> Json.fromInt(1))).traverse(body => request(name, auth(account, body)))
      }
      missing <- request("gettrainingrunapi", auth(account, Json.obj("runId" -> str(uuid))))
    yield
      malformed.foreach(error(_, Status.BadRequest, "validation_error"))
      error(missing, Status.NotFound, "not_found")
  }

  test("valid victory saves one result and completes its run with server-owned metadata") {
    for
      account <- register()
      cfg <- config
      run <- start(account, cfg)
      before <- request("gettrainingresultapi", auth(account, runPayload(run)))
      saved <- save(account, run, victory(cfg, misses = 3))
      fetched <- request("gettrainingresultapi", auth(account, runPayload(run)))
      completed <- request("gettrainingrunapi", auth(account, runPayload(run)))
    yield
      assertEquals(field(ok(before), "result"), Json.Null)
      val result = ok(saved)
      assertEquals(field(ok(fetched), "result"), result)
      assertEquals(string(result, "playerId"), account.id)
      assertEquals(field(result, "runId"), field(run, "id"))
      assertEquals(field(result, "configId"), field(cfg, "id"))
      assertEquals(field(result, "terrain"), field(run, "terrain"))
      assertEqualsDouble(field(result, "accuracy").asNumber.get.toDouble, 0.8, 0.000001)
      assertEquals(string(ok(completed), "status"), "completed")
      assert(!field(ok(completed), "completedAt").isNull)
  }

  test("parallel identical saves are idempotent; changed submission conflicts") {
    for
      account <- register()
      cfg <- config
      run <- start(account, cfg)
      replies <- List.fill(4)(victory(cfg)).parTraverse(save(account, run, _))
      conflict <- save(account, run, victory(cfg, elapsed = 11000))
      rows <- queryStrings("SELECT run_id FROM training_results WHERE run_id=?::uuid", string(run, "id"))
    yield
      assertEquals(replies.map(ok).distinct.size, 1)
      assertEquals(rows.size, 1)
      error(conflict, Status.Conflict, "conflict")
  }

  test("two different simultaneous saves choose exactly one immutable result") {
    for
      account <- register()
      cfg <- config
      run <- start(account, cfg)
      replies <- List(victory(cfg), defeat).parTraverse(save(account, run, _))
      lookup <- request("gettrainingresultapi", auth(account, runPayload(run)))
    yield
      assertEquals(replies.count(_.status == Status.Ok), 1)
      assertEquals(replies.count(_.status == Status.Conflict), 1)
      assertEquals(field(ok(lookup), "result"), replies.find(_.status == Status.Ok).get.body)
  }

  test("abandon is idempotent and prevents later result insertion") {
    for
      account <- register()
      cfg <- config
      run <- start(account, cfg)
      first <- request("abandontrainingrunapi", auth(account, runPayload(run)))
      retry <- request("abandontrainingrunapi", auth(account, runPayload(run)))
      saved <- save(account, run, defeat)
      lookup <- request("gettrainingresultapi", auth(account, runPayload(run)))
    yield
      assertEquals(string(field(ok(first), "run"), "status"), "abandoned")
      assertEquals(ok(retry), ok(first))
      error(saved, Status.Conflict, "conflict")
      assertEquals(field(ok(lookup), "result"), Json.Null)
  }

  test("racing abandon and save can commit only one legal terminal state") {
    for
      account <- register()
      cfg <- config
      run <- start(account, cfg)
      pair <- (request("abandontrainingrunapi", auth(account, runPayload(run))), save(account, run, defeat)).parTupled
      fetched <- request("gettrainingrunapi", auth(account, runPayload(run)))
      lookup <- request("gettrainingresultapi", auth(account, runPayload(run)))
    yield
      assertEquals(List(pair._1, pair._2).count(_.status == Status.Ok), 1)
      assertEquals(List(pair._1, pair._2).count(_.status == Status.Conflict), 1)
      val status = string(ok(fetched), "status")
      assert(Set("completed", "abandoned").contains(status))
      assertEquals(field(ok(lookup), "result").isNull, status == "abandoned")
  }

  test("result validation rejects impossible counters, enum, fraction, overflow and fire rate") {
    for
      account <- register()
      cfg <- config
      run <- start(account, cfg)
      base = victory(cfg)
      invalid = List(
        base.deepMerge(Json.obj("outcome" -> str("draw"))),
        base.deepMerge(Json.obj("hits" -> Json.fromInt(-1))),
        base.deepMerge(Json.obj("shotsFired" -> Json.fromInt(1))),
        base.deepMerge(Json.obj("destroyed" -> Json.fromInt(5))),
        base.deepMerge(Json.obj("destroyed" -> Json.fromInt(1))),
        base.deepMerge(Json.obj("outcome" -> str("defeat"))),
        base.deepMerge(Json.obj("elapsedMs" -> Json.fromInt(0))),
        base.deepMerge(Json.obj("shotsFired" -> Json.fromDoubleOrNull(12.5))),
        base.deepMerge(Json.obj("elapsedMs" -> Json.fromDoubleOrNull(10000.5))),
        base.deepMerge(Json.obj("hits" -> parser.parse("9999999999999999999999999999999999").toOption.get)),
        base.deepMerge(Json.obj("elapsedMs" -> parser.parse("1e100").toOption.get)),
        base.mapObject(_.remove("shotsFired"))
      )
      replies <- invalid.traverse(save(account, run, _))
      stillOpen <- request("gettrainingrunapi", auth(account, runPayload(run)))
    yield
      replies.foreach(error(_, Status.BadRequest, "validation_error"))
      assertEquals(string(ok(stillOpen), "status"), "open")
  }

  test("un-killed drone hit capacity is enforced and rejected saves keep the run open") {
    for
      account <- register()
      cfg <- config
      run <- start(account, cfg)
      invalid = defeat.deepMerge(Json.obj("hits" -> Json.fromInt(9), "shotsFired" -> Json.fromInt(9), "elapsedMs" -> Json.fromInt(10000)))
      reply <- save(account, run, invalid)
      open <- request("gettrainingrunapi", auth(account, runPayload(run)))
    yield
      error(reply, Status.BadRequest, "validation_error")
      assertEquals(string(ok(open), "status"), "open")
  }

  test("history paginates own results and personal best excludes defeat and other terrain") {
    for
      account <- register()
      stranger <- register()
      cfg <- config
      empty <- request("getmybestapi", auth(account, Json.obj("configId" -> field(cfg, "id"), "configVersion" -> field(cfg, "version"), "terrain" -> field(cfg, "terrain"))))
      first <- start(account, cfg)
      _ <- save(account, first, victory(cfg, elapsed = 8000, misses = 3)).map(ok)
      second <- start(account, cfg)
      _ <- save(account, second, victory(cfg, elapsed = 8000)).map(ok)
      third <- start(account, cfg)
      _ <- save(account, third, defeat).map(ok)
      terrain = field(cfg, "terrain").deepMerge(Json.obj("hillX" -> Json.fromDoubleOrNull(7.7)))
      different <- start(account, cfg, Some(terrain))
      _ <- save(account, different, victory(cfg, elapsed = 5000)).map(ok)
      best <- request("getmybestapi", auth(account, Json.obj("configId" -> field(cfg, "id"), "configVersion" -> field(cfg, "version"), "terrain" -> field(cfg, "terrain"))))
      history <- request("listmyresultsapi", auth(account, Json.obj("offset" -> Json.fromInt(1), "limit" -> Json.fromInt(2))))
      emptyHistory <- request("listmyresultsapi", auth(stranger, Json.obj("offset" -> Json.fromInt(0), "limit" -> Json.fromInt(50))))
    yield
      assertEquals(field(ok(empty), "best"), Json.Null)
      assertEquals(field(field(ok(best), "best"), "runId"), field(second, "id"))
      assertEquals(number(ok(history), "total"), 4)
      assertEquals(number(ok(history), "offset"), 1)
      assertEquals(number(ok(history), "limit"), 2)
      assertEquals(field(ok(history), "items").asArray.get.map(item => field(item, "runId")), Vector(field(third, "id"), field(second, "id")))
      assertEquals(number(ok(emptyHistory), "total"), 0)
  }

  test("pagination requires bounded integral offsets and limits") {
    for
      account <- register()
      invalid = List((-1, 10), (10001, 10), (0, 0), (0, 51)).map { case (offset, limit) => Json.obj("offset" -> Json.fromInt(offset), "limit" -> Json.fromInt(limit)) } :+
        Json.obj("offset" -> Json.fromDoubleOrNull(0.5), "limit" -> Json.fromInt(10))
      replies <- invalid.traverse(body => request("listmyresultsapi", auth(account, body)))
    yield replies.foreach(error(_, Status.BadRequest, "validation_error"))
  }

  test("result insert failure rolls back completion and produces a sanitized HTTP error") {
    for
      account <- register()
      cfg <- config
      run <- start(account, cfg)
      suffix = UUID.randomUUID().toString.replace("-", "")
      function = "test_reject_result_" + suffix
      trigger = "test_reject_result_" + suffix
      _ <- Resource.make(sql(s"CREATE FUNCTION $function() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''private test failure''; END'; CREATE TRIGGER $trigger BEFORE INSERT ON training_results FOR EACH ROW WHEN (NEW.run_id = '${string(run, "id")}'::uuid) EXECUTE FUNCTION $function()"))(_ =>
        sql(s"DROP TRIGGER IF EXISTS $trigger ON training_results; DROP FUNCTION IF EXISTS $function()").void).use { _ =>
          for
            failed <- save(account, run, victory(cfg))
            fetched <- request("gettrainingrunapi", auth(account, runPayload(run)))
            lookup <- request("gettrainingresultapi", auth(account, runPayload(run)))
          yield
            error(failed, Status.InternalServerError, "internal_error")
            assert(!failed.body.noSpaces.contains("private test failure"))
            assert(!failed.body.noSpaces.contains("SQLException"))
            assertEquals(string(ok(fetched), "status"), "open")
            assertEquals(field(ok(lookup), "result"), Json.Null)
        }
      retry <- save(account, run, victory(cfg))
    yield assertEquals(retry.status, Status.Ok)
  }

  test("explicit transaction failure rolls back prior writes") {
    for
      account <- register()
      failure <- database().transaction { connection =>
        execute(connection, "UPDATE players SET nickname='must roll back' WHERE id=?::uuid", account.id) *>
          IO.raiseError[Unit](new RuntimeException("forced rollback"))
      }.attempt
      fetched <- request("getcurrentplayerapi", auth(account))
    yield
      assert(failure.isLeft)
      assertEquals(string(ok(fetched), "nickname"), "训练员")
  }

  test("canceling an in-flight transaction rolls back writes and releases its connection") {
    for
      account <- register()
      reached <- Deferred[IO, Unit]
      fiber <- database().transaction { connection =>
        execute(connection, "UPDATE players SET nickname='must roll back' WHERE id=?::uuid", account.id) *>
          reached.complete(()) *> IO.never[Unit]
      }.start
      _ <- reached.get.timeout(10.seconds).guaranteeCase {
        case cats.effect.kernel.Outcome.Succeeded(_) => IO.unit
        case _ => fiber.cancel
      }
      _ <- fiber.cancel.timeout(10.seconds)
      fetched <- request("getcurrentplayerapi", auth(account))
    yield assertEquals(string(ok(fetched), "nickname"), "训练员")
  }

  test("reinitialization preserves the immutable published configuration and existing runs") {
    for
      account <- register()
      cfg <- config
      run <- start(account, cfg)
      _ <- database().transaction(DatabaseInitializer.initialize)
      after <- config
      fetched <- request("gettrainingrunapi", auth(account, runPayload(run)))
    yield
      assertEquals(after, cfg)
      assertEquals(field(ok(fetched), "config"), cfg)
  }

  test("changing a published configuration under the same version is detected and rolled back") {
    for
      before <- config
      rejected <- database().transaction { connection =>
        execute(connection, "UPDATE training_configs SET config_json=jsonb_set(config_json,'{title}','\"unauthorized replacement\"') WHERE id=?::uuid AND version=?", string(before, "id"), string(before, "version")) *>
          services.training.tables.trainingconfig.TrainingConfigTable.current(connection)
      }.attempt
      after <- config
    yield
      assert(rejected.isLeft, "An existing configuration version must not silently change its payload")
      assertEquals(after, before)
  }

  test("completion failure rolls back the result inserted earlier in the same API transaction") {
    for
      account <- register()
      cfg <- config
      run <- start(account, cfg)
      suffix = UUID.randomUUID().toString.replace("-", "")
      name = "test_reject_completion_" + suffix
      _ <- Resource.make(sql(s"CREATE FUNCTION $name() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''completion test failure''; END'; CREATE TRIGGER $name BEFORE UPDATE ON training_runs FOR EACH ROW WHEN (NEW.id = '${string(run, "id")}'::uuid AND NEW.status = 'completed') EXECUTE FUNCTION $name()"))(_ =>
        sql(s"DROP TRIGGER IF EXISTS $name ON training_runs; DROP FUNCTION IF EXISTS $name()").void).use { _ =>
          for
            failed <- save(account, run, victory(cfg))
            lookup <- request("gettrainingresultapi", auth(account, runPayload(run)))
            fetched <- request("gettrainingrunapi", auth(account, runPayload(run)))
          yield
            error(failed, Status.InternalServerError, "internal_error")
            assertEquals(field(ok(lookup), "result"), Json.Null)
            assertEquals(string(ok(fetched), "status"), "open")
        }
      retried <- save(account, run, victory(cfg))
    yield assertEquals(retried.status, Status.Ok)
  }

  test("historical frozen runs remain saveable after a rule upgrade, but cannot start new sessions") {
    for
      account <- register()
      current <- config
      oldJson = current.deepMerge(Json.obj("version" -> str("historical-" + uuid),
        "drones" -> Json.obj("chaseSpeed" -> Json.fromDoubleOrNull(3.25))))
      oldConfig <- IO.fromEither(oldJson.as[services.training.objects.TrainingConfig])
      oldRun <- database().transaction { connection =>
        services.training.tables.trainingconfig.TrainingConfigTable.insertIfAbsent(connection, oldConfig) *>
          services.training.tables.trainingrun.TrainingRunTable.insertIfAbsent(connection,
            services.player.objects.PlayerId(UUID.fromString(account.id)), UUID.randomUUID(), oldConfig, oldConfig.terrain)
            .flatMap(value => IO.fromOption(value)(new IllegalStateException("Historical setup failed")))
      }
      saved <- save(account, Json.obj("id" -> str(oldRun.id.value.toString)), victory(current))
      oldStart <- request("starttrainingrunapi", auth(account, startPayload(oldJson)))
      active <- config
      stored <- database().transaction(connection =>
        services.training.tables.trainingconfig.TrainingConfigTable.find(connection, oldConfig.id, oldConfig.version))
    yield
      assertEquals(string(ok(saved), "configVersion"), oldConfig.version)
      assertEquals(field(ok(saved), "terrain"), field(oldJson, "terrain"))
      error(oldStart, Status.Conflict, "conflict")
      assertEquals(active, current)
      assertEquals(stored, Some(oldConfig))
  }

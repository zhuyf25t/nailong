package services.worlds

import cats.effect.{IO, Resource}
import cats.syntax.all.*
import io.circe.{Json, parser}
import munit.CatsEffectSuite
import org.http4s.{Method, Request, Status, Uri}
import services.system.{DatabaseInitializer, DatabaseSession}
import services.system.objects.DatabaseConfig
import services.system.routes.ApiRouter
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}
import java.util.UUID
import scala.compiletime.testing.typeChecks
import scala.concurrent.duration.*
import scala.jdk.CollectionConverters.*
import scala.util.Using

/** Real API + PostgreSQL coverage. Every test owns its accounts; no shared rows are truncated. */
class WorldStorageIntegrationSuite extends CatsEffectSuite:
  override val munitTimeout: FiniteDuration = 90.seconds
  private val database = ResourceSuiteLocalFixture("world-storage-postgres", for
    config <- Resource.eval(IO {
      val result = DatabaseConfig.fromEnvironment
      require(result.databaseName.endsWith("_test"), "World integration tests require a _test database")
      result
    })
    db <- DatabaseSession.resource(config)
    _ <- Resource.eval(db.transaction(DatabaseInitializer.initialize))
  yield db)
  override def munitFixtures = List(database)

  private case class Reply(status: Status, body: Json)
  private case class Account(id: String, token: String)
  private def uuid: String = UUID.randomUUID().toString
  private def str(value: String): Json = Json.fromString(value)
  private def num(value: Int): Json = Json.fromInt(value)
  private def field(json: Json, key: String): Json = json.hcursor.downField(key).focus.getOrElse(fail(s"Missing $key: $json"))
  private def string(json: Json, key: String): String = field(json, key).asString.getOrElse(fail(s"Expected string $key"))
  private def integer(json: Json, key: String): Int = field(json, key).asNumber.flatMap(_.toInt).getOrElse(fail(s"Expected integer $key"))
  private def array(json: Json, key: String): Vector[Json] = field(json, key).asArray.getOrElse(fail(s"Expected array $key"))
  private def ok(reply: Reply): Json =
    assertEquals(reply.status, Status.Ok, reply.body.noSpaces)
    reply.body
  private def error(reply: Reply, status: Status): Unit =
    assertEquals(reply.status, status, reply.body.noSpaces)
    assertEquals(reply.body.asObject.get.keys.toSet, Set("code", "message"))
    assert(string(reply.body, "message").nonEmpty)
  private def auth(account: Account, body: Json): Json = body.deepMerge(Json.obj("userToken" -> str(account.token)))
  private def call(name: String, body: Json = Json.obj()): IO[Reply] =
    rawCall(name, body.noSpaces)
  private def rawCall(name: String, body: String): IO[Reply] =
    ApiRouter.httpApp(database())(Request[IO](Method.POST, Uri.unsafeFromString(s"/api/$name")).withEntity(body))
      .flatMap(response => response.as[String].flatMap(text => IO.fromEither(parser.parse(text)).map(Reply(response.status, _))))
  private def paddedJson(body: Json, byteCount: Int): String =
    val text = body.noSpaces
    val bytes = text.getBytes(StandardCharsets.UTF_8).length
    require(bytes < byteCount, "Payload fixture must leave room for legal JSON whitespace")
    text + (" " * (byteCount - bytes))
  private def register(): IO[Account] = call("registerplayerapi", Json.obj(
    "username" -> str("world_" + uuid.replace("-", "").take(18)),
    "password" -> str("World_testing_password_123"), "nickname" -> str("世界测试员")
  )).map { reply =>
    val result = ok(reply)
    Account(string(field(result, "player"), "id"), string(result, "userToken"))
  }
  private def list(account: Account, offset: Int = 0, limit: Int = 30): IO[Json] =
    call("listmymapsapi", auth(account, Json.obj("offset" -> num(offset), "limit" -> num(limit)))).map(ok)
  private def template(account: Account): IO[Json] = list(account).map(array(_, "templates").head)
  private def cloneVersion(account: Account, version: Json): IO[Json] =
    call("clonemapapi", auth(account, Json.obj("mapVersionId" -> field(version, "id")))).map(ok)
  private def cloneTemplate(account: Account): IO[Json] = template(account).flatMap(cloneVersion(account, _))
  private def readDraft(account: Account, draft: Json): IO[Json] =
    call("getmapdraftapi", auth(account, Json.obj("mapId" -> field(draft, "mapId")))).map(ok)
  private def readVersion(account: Account, version: Json): IO[Json] =
    call("getmapversionapi", auth(account, Json.obj("mapVersionId" -> field(version, "id")))).map(ok)
  private def freezeBody(draft: Json): Json = Json.obj("mapId" -> field(draft, "mapId"), "expectedRevision" -> field(draft, "revision"))
  private def freeze(account: Account, draft: Json): IO[Reply] = call("createmapversionapi", auth(account, freezeBody(draft)))
  private def saveBody(draft: Json, title: String): Json = Json.obj(
    "mapId" -> field(draft, "mapId"), "expectedRevision" -> field(draft, "revision"), "title" -> str(title),
    "world" -> field(draft, "world").deepMerge(Json.obj("title" -> str(title))))
  private def save(account: Account, body: Json): IO[Reply] = call("savemapdraftapi", auth(account, body))
  private def resourceJson(name: String): IO[Json] = IO.blocking {
    val stream = Option(getClass.getClassLoader.getResourceAsStream(name)).getOrElse(fail(s"Missing classpath resource: $name"))
    Using.resource(stream)(input => new String(input.readAllBytes(), StandardCharsets.UTF_8))
  }.flatMap(text => IO.fromEither(parser.parse(text)))
  private def versionCount(draft: Json): IO[Int] = database().transaction(connection => IO.blocking {
    Using.resource(connection.prepareStatement("select count(*) from world_map_versions where map_id = ?::uuid")) { statement =>
      statement.setString(1, string(draft, "mapId"))
      Using.resource(statement.executeQuery()) { rows => rows.next(); rows.getInt(1) }
    }
  })

  test("missions are public and point to real distinct immutable built-in templates") {
    for
      missionsReply <- call("listmissionsapi")
      missions = array(ok(missionsReply), "missions")
      details <- missions.toList.traverse(value => call("getmissionapi", Json.obj("missionId" -> field(value, "id"))).map(ok))
      account <- register()
      listed <- list(account)
      bundled <- resourceJson("worlds/templates.json")
      templates = array(listed, "templates")
      missing <- call("getmissionapi", Json.obj("missionId" -> str("unknown-mission")))
    yield
      assertEquals(missions.map(string(_, "id")).toSet, Set("clear-drones", "forest-beacon"))
      assertEquals(details, missions.toList)
      assertEquals(templates.size, 2)
      assertEquals(templates.map(string(_, "id")).distinct.size, templates.size)
      assertEquals(templates.map(string(_, "mapId")).distinct.size, templates.size)
      templates.foreach { version =>
        assertEquals(field(version, "builtIn"), Json.True)
        assertEquals(integer(version, "version"), 1)
        val source = bundled.asArray.get.find(value => field(value, "id") == field(version, "id")).get
        assertEquals(field(version, "world"), field(source, "world"))
        assert(array(field(version, "world"), "objects").nonEmpty)
        assert(array(field(version, "world"), "drones").nonEmpty)
      }
      missions.foreach(value => assert(templates.exists(version => field(version, "id") == field(value, "mapVersionId"))))
      assertEquals(integer(listed, "total"), 0)
      error(missing, Status.NotFound)
  }

  test("MapId and MapVersionId cannot be interchanged with one another or PlayerId") {
    assert(!typeChecks("""val id = services.worlds.objects.MapId(java.util.UUID.randomUUID()); val version: services.worlds.objects.MapVersionId = id"""))
    assert(!typeChecks("""val id = services.worlds.objects.MapVersionId(java.util.UUID.randomUUID()); val map: services.worlds.objects.MapId = id"""))
    assert(!typeChecks("""val id = services.player.objects.PlayerId(java.util.UUID.randomUUID()); val map: services.worlds.objects.MapId = id"""))
  }

  test("cloning creates a fresh owned draft and can clone an accessible personal frozen version") {
    for
      account <- register()
      source <- template(account)
      first <- cloneVersion(account, source)
      fetched <- readDraft(account, first)
      frozen <- freeze(account, first).map(ok)
      second <- cloneVersion(account, frozen)
      listed <- list(account)
    yield
      assertNotEquals(field(first, "mapId"), field(source, "mapId"))
      assertNotEquals(field(second, "mapId"), field(first, "mapId"))
      assertEquals(integer(first, "revision"), 1)
      assertEquals(integer(second, "revision"), 1)
      assertEquals(field(first, "world"), field(source, "world"))
      assertEquals(field(second, "world"), field(frozen, "world"))
      assertEquals(fetched, first)
      assertEquals(integer(listed, "total"), 2)
      assertEquals(array(listed, "maps").map(field(_, "mapId")).toSet, Set(field(first, "mapId"), field(second, "mapId")))
      assert(array(listed, "maps").forall(value => field(value, "builtIn") == Json.False))
  }

  test("optimistic concurrent saves at one revision commit exactly one complete world") {
    for
      account <- register()
      draft <- cloneTemplate(account)
      candidates = List(saveBody(draft, "并发甲"), saveBody(draft, "并发乙"))
      replies <- candidates.parTraverse(save(account, _))
      current <- readDraft(account, draft)
    yield
      assertEquals(replies.count(_.status == Status.Ok), 1)
      assertEquals(replies.count(_.status == Status.Conflict), 1)
      val winner = ok(replies.find(_.status == Status.Ok).get)
      assertEquals(current, winner)
      assertEquals(integer(current, "revision"), integer(draft, "revision") + 1)
      assertEquals(field(current, "title"), field(field(current, "world"), "title"))
      assert(Set("并发甲", "并发乙").contains(string(current, "title")))
  }

  test("invalid worlds and mismatched titles leave all draft fields and its revision unchanged") {
    for
      account <- register()
      draft <- cloneTemplate(account)
      valid = saveBody(draft, "合法名称")
      world = field(valid, "world")
      firstObject = array(world, "objects").head
      invalid = List(
        valid.deepMerge(Json.obj("title" -> str("与世界不同"))),
        valid.deepMerge(Json.obj("world" -> world.deepMerge(Json.obj("bounds" -> Json.obj("halfSize" -> num(1000)))))),
        valid.deepMerge(Json.obj("world" -> world.deepMerge(Json.obj("drones" -> Json.arr())))),
        valid.deepMerge(Json.obj("world" -> world.deepMerge(Json.obj("spawn" -> Json.obj("x" -> field(firstObject, "x"), "z" -> field(firstObject, "z"), "yaw" -> num(0)))))),
        valid.deepMerge(Json.obj("world" -> world.deepMerge(Json.obj("beacon" -> field(world, "beacon").deepMerge(Json.obj("id" -> field(array(world, "drones").head, "id"))))))),
        valid.deepMerge(Json.obj("title" -> str(""), "world" -> world.deepMerge(Json.obj("title" -> str("")))))
      )
      replies <- invalid.traverse(save(account, _))
      current <- readDraft(account, draft)
    yield
      replies.foreach(error(_, Status.BadRequest))
      assertEquals(current, draft)
  }

  test("repeated and concurrent freeze requests for one revision create exactly one immutable version") {
    for
      account <- register()
      draft <- cloneTemplate(account)
      replies <- List.fill(4)(draft).parTraverse(freeze(account, _))
      first = ok(replies.head)
      repeated <- freeze(account, draft).map(ok)
      stored <- readVersion(account, first)
      count <- versionCount(draft)
    yield
      assertEquals(replies.map(ok).distinct.size, 1)
      assertEquals(repeated, first)
      assertEquals(stored, first)
      assertEquals(integer(first, "version"), 1)
      assertEquals(field(first, "builtIn"), Json.False)
      assertEquals(field(first, "world"), field(draft, "world"))
      assertEquals(count, 1)
  }

  test("later edits never alter frozen worlds and retrying an older frozen revision returns its original version") {
    for
      account <- register()
      draft <- cloneTemplate(account)
      first <- freeze(account, draft).map(ok)
      edited <- save(account, saveBody(draft, "第二版庭院")).map(ok)
      repeated <- freeze(account, draft).map(ok)
      second <- freeze(account, edited).map(ok)
      oldFetched <- readVersion(account, first)
      newFetched <- readVersion(account, second)
      listed <- list(account)
      count <- versionCount(draft)
    yield
      assertEquals(repeated, first)
      assertEquals(oldFetched, first)
      assertEquals(newFetched, second)
      assertNotEquals(field(first, "id"), field(second, "id"))
      assertEquals(integer(second, "version"), integer(first, "version") + 1)
      assertEquals(field(first, "world"), field(draft, "world"))
      assertEquals(field(second, "world"), field(edited, "world"))
      assertEquals(field(array(listed, "maps").head, "latestVersionId"), field(second, "id"))
      assertEquals(count, 2)
  }

  test("an old revision that was never frozen cannot accidentally freeze newer draft contents") {
    for
      account <- register()
      original <- cloneTemplate(account)
      edited <- save(account, saveBody(original, "已经更新")).map(ok)
      stale <- freeze(account, original)
      count <- versionCount(original)
      current <- readDraft(account, original)
    yield
      error(stale, Status.Conflict)
      assertEquals(count, 0)
      assertEquals(current, edited)
  }

  test("other owners receive 404 for draft, version, save, freeze and clone without changing the source") {
    for
      owner <- register()
      stranger <- register()
      draft <- cloneTemplate(owner)
      frozen <- freeze(owner, draft).map(ok)
      replies <- List(
        ("getmapdraftapi", Json.obj("mapId" -> field(draft, "mapId"))),
        ("getmapversionapi", Json.obj("mapVersionId" -> field(frozen, "id"))),
        ("savemapdraftapi", saveBody(draft, "他人修改")),
        ("createmapversionapi", freezeBody(draft)),
        ("clonemapapi", Json.obj("mapVersionId" -> field(frozen, "id")))
      ).traverse { case (endpoint, body) => call(endpoint, auth(stranger, body)) }
      current <- readDraft(owner, draft)
      currentVersion <- readVersion(owner, frozen)
      strangerList <- list(stranger)
    yield
      replies.foreach(error(_, Status.NotFound))
      assertEquals(current, draft)
      assertEquals(currentVersion, frozen)
      assertEquals(integer(strangerList, "total"), 0)
      assertEquals(array(strangerList, "maps"), Vector.empty[Json])
  }

  test("built-in maps are readable and cloneable but have no editable or freezable personal draft") {
    for
      account <- register()
      source <- template(account)
      fakeDraft = Json.obj("mapId" -> field(source, "mapId"), "revision" -> num(0), "world" -> field(source, "world"))
      read <- call("getmapdraftapi", auth(account, Json.obj("mapId" -> field(source, "mapId"))))
      edited <- save(account, saveBody(fakeDraft, "覆盖内置"))
      frozen <- freeze(account, fakeDraft)
      again <- readVersion(account, source)
    yield
      List(read, edited, frozen).foreach(error(_, Status.NotFound))
      assertEquals(again, source)
  }

  test("map lists contain only personal drafts and pagination selects stable nonoverlapping rows") {
    for
      owner <- register()
      stranger <- register()
      drafts <- List.fill(3)(()).traverse(_ => cloneTemplate(owner))
      other <- cloneTemplate(stranger)
      all <- list(owner)
      first <- list(owner, 0, 2)
      second <- list(owner, 2, 2)
      far <- list(owner, 100000, 100)
      strangerList <- list(stranger)
    yield
      assertEquals(integer(all, "total"), 3)
      assertEquals(array(all, "maps").map(field(_, "mapId")).toSet, drafts.map(field(_, "mapId")).toSet)
      assertEquals(array(first, "maps") ++ array(second, "maps"), array(all, "maps"))
      assertEquals(integer(first, "total"), 3)
      assertEquals(integer(second, "total"), 3)
      assertEquals(array(far, "maps"), Vector.empty[Json])
      assertEquals(integer(strangerList, "total"), 1)
      assertEquals(field(array(strangerList, "maps").head, "mapId"), field(other, "mapId"))
  }

  test("pagination accepts only native bounded integers and revisions reject strings or fractions") {
    for
      account <- register()
      draft <- cloneTemplate(account)
      badPages = List(
        Json.obj("offset" -> str("0"), "limit" -> num(30)), Json.obj("offset" -> num(0), "limit" -> str("30")),
        Json.obj("offset" -> Json.fromDoubleOrNull(0.5), "limit" -> num(30)), Json.obj("offset" -> num(0), "limit" -> Json.fromDoubleOrNull(1.5)),
        Json.obj("offset" -> num(-1), "limit" -> num(30)), Json.obj("offset" -> num(100001), "limit" -> num(30)),
        Json.obj("offset" -> num(0), "limit" -> num(0)), Json.obj("offset" -> num(0), "limit" -> num(101)),
        Json.obj("offset" -> Json.fromLong(Int.MaxValue.toLong + 1), "limit" -> num(30)),
        Json.obj("offset" -> Json.Null, "limit" -> num(30)), Json.obj("offset" -> num(0))
      )
      pageReplies <- badPages.traverse(body => call("listmymapsapi", auth(account, body)))
      badRevisions = List(str("1"), Json.fromDoubleOrNull(1.5), num(-1), Json.fromLong(Int.MaxValue.toLong + 1))
      saveReplies <- badRevisions.traverse(value => save(account, saveBody(draft, "不应写入").deepMerge(Json.obj("expectedRevision" -> value))))
      freezeReplies <- badRevisions.traverse(value => call("createmapversionapi", auth(account, freezeBody(draft).deepMerge(Json.obj("expectedRevision" -> value)))))
      current <- readDraft(account, draft)
    yield
      (pageReplies ++ saveReplies ++ freezeReplies).foreach(error(_, Status.BadRequest))
      assertEquals(current, draft)
  }

  test("repeated built-in seeding preserves template versions, published missions and personal worlds") {
    for
      account <- register()
      draft <- cloneTemplate(account)
      personal <- freeze(account, draft).map(ok)
      before <- list(account)
      missionsBefore <- call("listmissionsapi").map(ok)
      _ <- database().transaction(WorldInitializer.initialize)
      _ <- database().transaction(WorldInitializer.initialize)
      after <- list(account)
      missionsAfter <- call("listmissionsapi").map(ok)
      personalAfter <- readVersion(account, personal)
    yield
      assertEquals(after, before)
      assertEquals(missionsAfter, missionsBefore)
      assertEquals(personalAfter, personal)
  }

  test("draft saves accept over 16 KiB up to their 64 KiB budget while oversized bodies never mutate revision") {
    for
      account <- register()
      draft <- cloneTemplate(account)
      acceptedBody = paddedJson(auth(account, saveBody(draft, "较大世界请求")), 32768)
      accepted <- rawCall("savemapdraftapi", acceptedBody)
      saved = ok(accepted)
      oversizedBody = paddedJson(auth(account, saveBody(saved, "超限不应写入")), 65537)
      rejected <- rawCall("savemapdraftapi", oversizedBody)
      current <- readDraft(account, draft)
      smallApiBody = paddedJson(auth(account, Json.obj("offset" -> num(0), "limit" -> num(30))), 16385)
      rejectedSmallApi <- rawCall("listmymapsapi", smallApiBody)
    yield
      assertEquals(acceptedBody.getBytes(StandardCharsets.UTF_8).length, 32768)
      assertEquals(integer(saved, "revision"), integer(draft, "revision") + 1)
      assertEquals(string(saved, "title"), "较大世界请求")
      assertEquals(oversizedBody.getBytes(StandardCharsets.UTF_8).length, 65537)
      error(rejected, Status.BadRequest)
      assertEquals(string(rejected.body, "message"), "请求过大。")
      assertEquals(current, saved)
      error(rejectedSmallApi, Status.BadRequest)
      assertEquals(string(rejectedSmallApi.body, "message"), "请求过大。")
  }

  test("every shared world and mission JSON equals its classpath resource") {
    for
      shared <- IO.blocking {
        Iterator.iterate(Paths.get("").toAbsolutePath.normalize())(_.getParent).takeWhile(_ != null).take(5)
          .map(_.resolve("shared")).find(path => Files.isDirectory(path)).getOrElse(fail("Cannot locate repository shared/ for contract comparison"))
      }
      paths <- IO.blocking {
        List("worlds", "missions").flatMap { directory =>
          Using.resource(Files.list(shared.resolve(directory)))(stream => stream.iterator().asScala.filter(path => path.getFileName.toString.endsWith(".json")).toList)
        }
      }
      _ = assert(paths.size >= 5)
      _ <- paths.traverse_ { path =>
        val relative = shared.relativize(path).toString.replace('\\', '/')
        for
          text <- IO.blocking(Files.readString(path, StandardCharsets.UTF_8))
          expected <- IO.fromEither(parser.parse(text))
          bundled <- resourceJson(relative)
        yield assertEquals(bundled, expected, relative)
      }
    yield ()
  }

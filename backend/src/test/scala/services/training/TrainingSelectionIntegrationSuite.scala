package services.training

import cats.effect.{IO, Resource}
import cats.syntax.all.*
import io.circe.{Json, parser}
import munit.CatsEffectSuite
import org.http4s.{Method, Request, Status, Uri}
import services.system.{DatabaseInitializer, DatabaseSession}
import services.system.objects.DatabaseConfig
import java.util.UUID
import scala.concurrent.duration.*
import services.system.routes.ApiRouter

/** Actual PostgreSQL transactions exercise version freezing and request-key races. */
class TrainingSelectionIntegrationSuite extends CatsEffectSuite:
  override val munitTimeout: FiniteDuration = 90.seconds
  private val database = ResourceSuiteLocalFixture("training-selection-postgres", for
    config <- Resource.eval(IO {
      val result = DatabaseConfig.fromEnvironment
      require(result.databaseName.endsWith("_test"), "Training integration tests require a _test database")
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
  private def field(json: Json, key: String): Json = json.hcursor.downField(key).focus.getOrElse(fail(s"Missing $key: $json"))
  private def string(json: Json, key: String): String = field(json, key).asString.getOrElse(fail(s"Expected string $key"))
  private def ok(reply: Reply): Json =
    assertEquals(reply.status, Status.Ok, reply.body.noSpaces)
    reply.body
  private def auth(account: Account, body: Json): Json = body.deepMerge(Json.obj("userToken" -> str(account.token)))
  private def call(name: String, body: Json = Json.obj()): IO[Reply] =
    ApiRouter.httpApp(database())(Request[IO](Method.POST, Uri.unsafeFromString(s"/api/$name")).withEntity(body.noSpaces))
      .flatMap(response => response.as[String].flatMap(text => IO.fromEither(parser.parse(text)).map(Reply(response.status, _))))
  private def register(): IO[Account] = call("registerplayerapi", Json.obj(
    "username" -> str("selection_" + uuid.replace("-", "").take(14)),
    "password" -> str("Selection_password_123"), "nickname" -> str("任务测试员")
  )).map { reply =>
    val result = ok(reply)
    Account(string(field(result, "player"), "id"), string(result, "userToken"))
  }
  private def config: IO[Json] = call("gettrainingconfigapi").map(ok)
  private def mission(id: String = "clear-drones"): IO[Json] = call("getmissionapi", Json.obj("missionId" -> str(id))).map(ok)
  private def mapVersion(account: Account, id: Json): IO[Json] = call("getmapversionapi", auth(account, Json.obj("mapVersionId" -> id))).map(ok)
  private def selection(id: String = "clear-drones", map: Option[Json] = None, tool: String = "none"): Json =
    val base = Json.obj("missionId" -> str(id), "loadout" -> Json.obj("tool" -> str(tool)))
    map.fold(base)(value => base.deepMerge(Json.obj("mapVersionId" -> value)))
  private def payload(cfg: Json, terrain: Json, chosen: Option[Json], key: String = uuid): Json =
    val base = Json.obj("requestId" -> str(key), "configId" -> field(cfg, "id"), "configVersion" -> field(cfg, "version"), "terrain" -> terrain)
    chosen.fold(base)(value => base.deepMerge(Json.obj("selection" -> value)))
  private def start(account: Account, value: Json): IO[Reply] = call("starttrainingrunapi", auth(account, value))
  private def fetch(account: Account, run: Json): IO[Json] =
    call("gettrainingrunapi", auth(account, Json.obj("runId" -> field(run, "id")))).map(ok)

  test("legacy starts and old nullable rows remain compatible without a setup") {
    for
      account <- register()
      cfg <- config
      reply <- start(account, payload(cfg, field(cfg, "terrain"), None))
      run = ok(reply)
      _ <- database().transaction(DatabaseInitializer.initialize)
      again <- fetch(account, run)
    yield
      assertEquals(field(run, "setup"), Json.Null)
      assertEquals(field(run, "config"), cfg)
      assertEquals(again, run)
  }

  test("selected starts freeze the exact world, objective, loadout, seed and matching drone config") {
    for
      account <- register()
      cfg <- config
      definition <- mission()
      version <- mapVersion(account, field(definition, "mapVersionId"))
      world = field(version, "world")
      body = payload(cfg, field(world, "terrain"), Some(selection()))
      reply <- start(account, body)
      run = ok(reply)
      duplicate <- start(account, body)
      again <- fetch(account, run)
    yield
      val setup = field(run, "setup")
      assertEquals(field(setup, "world"), world)
      assertEquals(field(setup, "mission"), definition)
      assertEquals(field(setup, "mapVersionId"), field(version, "id"))
      assertEquals(field(setup, "loadout"), Json.obj("tool" -> str("none")))
      assertEquals(string(setup, "assetVersion"), "garden-v1")
      val seed = field(setup, "seed").asNumber.flatMap(_.toLong).get
      assert(seed >= 0 && seed <= Int.MaxValue.toLong)
      val expectedSpawns = field(world, "drones").asArray.get.map { drone =>
        Json.obj("x" -> field(drone, "x"), "z" -> field(drone, "z"), "yaw" -> field(drone, "yaw"))
      }
      assertEquals(field(field(field(run, "config"), "drones"), "spawns"), Json.fromValues(expectedSpawns))
      assertEquals(field(field(run, "config"), "terrain"), field(world, "terrain"))
      assertEquals(ok(duplicate), run)
      assertEquals(again, run)
  }

  test("idempotency compares original optional map selection, tool and mission, not only resolved setup") {
    for
      account <- register()
      cfg <- config
      definition <- mission()
      version <- mapVersion(account, field(definition, "mapVersionId"))
      body = payload(cfg, field(field(version, "world"), "terrain"), Some(selection()))
      first <- start(account, body).map(ok)
      explicit <- start(account, body.deepMerge(Json.obj("selection" -> selection(map = Some(field(version, "id"))))))
      tool <- start(account, body.deepMerge(Json.obj("selection" -> selection(tool = "pulse"))))
      other <- start(account, body.deepMerge(Json.obj("selection" -> selection(id = "forest-beacon"))))
      removed <- start(account, body.mapObject(_.remove("selection")))
      retry <- start(account, body)
    yield
      List(explicit, tool, other, removed).foreach(reply => assertEquals(reply.status, Status.Conflict, reply.body.noSpaces))
      assertEquals(ok(retry), first)
  }

  test("simultaneous identical selected starts return one snapshot including the same random seed") {
    for
      account <- register()
      cfg <- config
      definition <- mission()
      version <- mapVersion(account, field(definition, "mapVersionId"))
      body = payload(cfg, field(field(version, "world"), "terrain"), Some(selection()))
      replies <- List.fill(4)(body).parTraverse(start(account, _))
    yield assertEquals(replies.map(ok).distinct.size, 1)
  }

  test("concurrent omitted and explicit default-map requests conflict even when their worlds coincide") {
    for
      account <- register()
      cfg <- config
      definition <- mission()
      version <- mapVersion(account, field(definition, "mapVersionId"))
      body = payload(cfg, field(field(version, "world"), "terrain"), Some(selection()))
      explicit = body.deepMerge(Json.obj("selection" -> selection(map = Some(field(version, "id")))))
      replies <- List(body, explicit).parTraverse(start(account, _))
    yield
      assertEquals(replies.count(_.status == Status.Ok), 1)
      assertEquals(replies.count(_.status == Status.Conflict), 1)
  }

  test("wrong terrain, stale rules and unknown tools cannot create selected runs") {
    for
      account <- register()
      cfg <- config
      definition <- mission()
      version <- mapVersion(account, field(definition, "mapVersionId"))
      worldTerrain = field(field(version, "world"), "terrain")
      body = payload(cfg, worldTerrain, Some(selection()))
      currentRipple = field(worldTerrain, "ripple").asNumber.get.toDouble
      otherTerrain = worldTerrain.deepMerge(Json.obj("ripple" -> Json.fromDoubleOrNull(if currentRipple == 0 then 0.1 else 0)))
      mismatch <- start(account, body.deepMerge(Json.obj("terrain" -> otherTerrain)))
      stale <- start(account, body.deepMerge(Json.obj("configVersion" -> str("obsolete"))))
      badTool <- start(account, body.deepMerge(Json.obj("selection" -> selection(tool = "unlimited-bombs"))))
    yield
      assertEquals(mismatch.status, Status.Conflict)
      assertEquals(stale.status, Status.Conflict)
      assertEquals(badTool.status, Status.BadRequest)
  }

  test("custom map snapshots remap objective IDs and retain their frozen version after later edits") {
    for
      account <- register()
      cfg <- config
      definition <- mission("forest-beacon")
      cloneReply <- call("clonemapapi", auth(account, Json.obj("mapVersionId" -> field(definition, "mapVersionId"))))
      draft = ok(cloneReply)
      originalWorld = field(draft, "world")
      customWorld = originalWorld.deepMerge(Json.obj(
        "title" -> str("冻结测试"),
        "drones" -> Json.fromValues(field(originalWorld, "drones").asArray.get.dropRight(1)),
        "beacon" -> field(originalWorld, "beacon").deepMerge(Json.obj("id" -> str("custom-beacon"))),
        "extraction" -> field(originalWorld, "extraction").deepMerge(Json.obj("id" -> str("custom-extraction")))
      ))
      savedReply <- call("savemapdraftapi", auth(account, Json.obj(
        "mapId" -> field(draft, "mapId"), "expectedRevision" -> field(draft, "revision"), "title" -> str("冻结测试"), "world" -> customWorld)))
      saved = ok(savedReply)
      frozenReply <- call("createmapversionapi", auth(account, Json.obj("mapId" -> field(saved, "mapId"), "expectedRevision" -> field(saved, "revision"))))
      frozen = ok(frozenReply)
      runReply <- start(account, payload(cfg, field(customWorld, "terrain"), Some(selection("forest-beacon", Some(field(frozen, "id"))))))
      run = ok(runReply)
      changedReply <- call("savemapdraftapi", auth(account, Json.obj(
        "mapId" -> field(saved, "mapId"), "expectedRevision" -> field(saved, "revision"), "title" -> str("后来修改"),
        "world" -> customWorld.deepMerge(Json.obj("title" -> str("后来修改"))))))
      _ = ok(changedReply)
      again <- fetch(account, run)
    yield
      val setup = field(run, "setup")
      val frozenMission = field(setup, "mission")
      assertEquals(field(setup, "world"), customWorld)
      assertEquals(field(field(field(run, "config"), "drones"), "spawns").asArray.get.size, field(customWorld, "drones").asArray.get.size)
      assertEquals(field(setup, "mapVersionId"), field(frozen, "id"))
      assertEquals(field(frozenMission, "mapVersionId"), field(frozen, "id"))
      assertEquals(field(frozenMission, "objective"), Json.obj("kind" -> str("activate_extract"), "beaconId" -> str("custom-beacon"), "extractionId" -> str("custom-extraction")))
      assertEquals(again, run)
  }

  test("selected runs cannot load another player's private frozen map") {
    for
      owner <- register()
      intruder <- register()
      cfg <- config
      definition <- mission()
      draftReply <- call("clonemapapi", auth(owner, Json.obj("mapVersionId" -> field(definition, "mapVersionId"))))
      draft = ok(draftReply)
      frozenReply <- call("createmapversionapi", auth(owner, Json.obj("mapId" -> field(draft, "mapId"), "expectedRevision" -> field(draft, "revision"))))
      frozen = ok(frozenReply)
      attempted <- start(intruder, payload(cfg, field(field(frozen, "world"), "terrain"), Some(selection(map = Some(field(frozen, "id"))))))
    yield assert(Set(Status.Forbidden, Status.NotFound).contains(attempted.status), attempted.body.noSpaces)
  }

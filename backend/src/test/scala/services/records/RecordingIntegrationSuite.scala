package services.records

import cats.effect.{IO, Resource}
import cats.syntax.all.*
import io.circe.{Json, parser}
import io.circe.syntax.*
import munit.CatsEffectSuite
import org.http4s.{Method, Request, Status, Uri}
import services.system.{DatabaseInitializer, DatabaseSession}
import services.system.objects.DatabaseConfig
import services.system.routes.ApiRouter
import services.records.objects.*
import services.records.utils.RecordingValidation
import services.training.objects.*
import java.util.UUID
import scala.concurrent.duration.*
import scala.util.Using

/** Real PostgreSQL, API authentication and transaction boundaries; never truncates shared tables. */
class RecordingIntegrationSuite extends CatsEffectSuite:
  override val munitTimeout = 90.seconds
  private val database = ResourceSuiteLocalFixture("recording-postgres", for
    config <- Resource.eval(IO { val c = DatabaseConfig.fromEnvironment; require(c.databaseName.endsWith("_test")); c })
    db <- DatabaseSession.resource(config)
    _ <- Resource.eval(db.transaction(DatabaseInitializer.initialize))
  yield db)
  override def munitFixtures = List(database)
  private case class Reply(status: Status, body: Json)
  private def s(value: String): Json = Json.fromString(value)
  private def api(name: String, body: Json): IO[Reply] = raw(name, body.noSpaces)
  private def raw(name: String, text: String): IO[Reply] =
    ApiRouter.httpApp(database())(Request[IO](Method.POST, Uri.unsafeFromString(s"/api/$name")).withEntity(text)).flatMap(r =>
      r.as[String].flatMap(v => IO.fromEither(parser.parse(v))).map(Reply(r.status, _)))
  private def ok(value: Reply): Json = { assertEquals(value.status, Status.Ok, value.body.noSpaces); value.body }
  private def status(value: Reply, expected: Status): Unit = assertEquals(value.status, expected, value.body.noSpaces)
  private def token: IO[String] = api("registerplayerapi", Json.obj("username" -> s("rec_" + UUID.randomUUID().toString.replace("-", "").take(18)),
    "password" -> s("Recording_test_password_123"), "nickname" -> s("回放测试"))).map(r => ok(r).hcursor.get[String]("userToken").toOption.get)
  private def auth(token: String, fields: (String, Json)*): Json = Json.obj((Seq("userToken" -> s(token)) ++ fields)*)
  private def start(token: String, selected: Boolean = true, mission: String = "forest-beacon"): IO[TrainingRun] = for
    config <- api("gettrainingconfigapi", Json.obj()).map(ok).flatMap(j => IO.fromEither(j.as[TrainingConfig]))
    terrain <- if !selected then IO.pure(config.terrain.asJson) else
      for
        definition <- api("getmissionapi", Json.obj("missionId" -> s(mission))).map(ok)
        version <- api("getmapversionapi", auth(token, "mapVersionId" -> definition.hcursor.downField("mapVersionId").focus.get)).map(ok)
      yield version.hcursor.downField("world").downField("terrain").focus.get
    base = auth(token, "requestId" -> s(UUID.randomUUID().toString), "configId" -> config.id.asJson, "configVersion" -> s(config.version), "terrain" -> terrain)
    body = if selected then base.deepMerge(Json.obj("selection" -> Json.obj("missionId" -> s(mission), "loadout" -> Json.obj("tool" -> s("curtain"))))) else base
    run <- api("starttrainingrunapi", body).map(ok).flatMap(j => IO.fromEither(j.as[TrainingRun]))
  yield run
  private def submission = ResultSubmission(ResultOutcome.Defeat, 0, 0, 0, 1000, Some(ObjectiveProgress(false, false)))
  private def saveScore(token: String, run: TrainingRun, value: ResultSubmission = submission): IO[Reply] =
    api("savetrainingresultapi", auth(token, "runId" -> run.id.asJson, "submission" -> value.asJson))
  private def summary: RunEventSummary = RunEventSummary(1, 1000, 1000, false,
    List(RunEvent(0, 1000, "round-end", Some("player"), None, None, None, Some("defeat"))))
  private def payload(run: TrainingRun): ReplayPayload =
    val setup = run.setup.get
    val player = ReplayPlayerState(Point3(setup.world.spawn.x, 1, setup.world.spawn.z), 0, "idle", 0, 0, true)
    val drones = setup.world.drones.map(d => ReplayDroneState(d.id, Point3(d.x, 2.2, d.z), d.yaw, run.config.drones.maxHp, "scanning", "cruising"))
    val frame = ReplayFrame(0, 0, -1, player, drones, Nil, Nil, ReplayWorldState(Nil, false, false), ReplayCameraState(Point3(0, 10, 10), Point3(0, 0, 0), 55))
    ReplayPayload(ReplayManifest(1, Some(run.id), run.config, setup.world, Some(setup.mapVersionId), setup.mission.id.value,
      setup.assetVersion, 10, ReplayCoverage("complete", None, 0, 1000, 1000, 1000)),
      List(frame, frame.copy(tMs = 1000, scoreElapsedMs = 1000, throughEventSeq = 0, player = player.copy(alive = false))), summary.events)
  private def envelope(value: ReplayPayload): ReplayEnvelope =
    val text = value.asJson.noSpaces
    ReplayEnvelope(RecordingValidation.hash(text), text)
  private def saveEvents(token: String, run: TrainingRun, value: RunEventSummary = summary): IO[Reply] =
    api("saveruneventsapi", auth(token, "runId" -> run.id.asJson, "summary" -> value.asJson))
  private def saveReplay(token: String, run: TrainingRun, value: ReplayEnvelope): IO[Reply] =
    api("saverunreplayapi", auth(token, "runId" -> run.id.asJson, "replay" -> value.asJson))
  private def lookup(token: String, run: TrainingRun, kind: String): IO[Reply] = api(s"getrun${kind}api", auth(token, "runId" -> run.id.asJson))

  test("extraction can win without kills; frozen setup and objective progress survive storage") {
    for
      owner <- token
      run <- start(owner)
      invalid <- saveScore(owner, run, submission.copy(outcome = ResultOutcome.Victory))
      saved <- saveScore(owner, run, submission.copy(outcome = ResultOutcome.Victory, objectiveProgress = Some(ObjectiveProgress(true, true))))
      replayed <- saveScore(owner, run, submission.copy(outcome = ResultOutcome.Victory, objectiveProgress = Some(ObjectiveProgress(true, true))))
      best <- api("getmybestapi", auth(owner, "configId" -> run.config.id.asJson, "configVersion" -> s(run.config.version), "terrain" -> run.terrain.asJson))
    yield
      status(invalid, Status.BadRequest)
      val result = ok(saved).as[TrainingResult].toOption.get
      assertEquals(result.setup, run.setup)
      assertEquals(result.objectiveProgress, Some(ObjectiveProgress(true, true)))
      assertEquals(ok(replayed), ok(saved))
      assert(ok(best).hcursor.downField("best").focus.get.isNull)
  }

  test("scores precede independent recordings; owner checks cover reads and writes") {
    for
      owner <- token
      other <- token
      run <- start(owner)
      noScore <- saveEvents(owner, run)
      noScoreReplay <- saveReplay(owner, run, envelope(payload(run)))
      _ <- saveScore(owner, run).map(ok)
      forbidden <- List(saveEvents(other, run), saveReplay(other, run, envelope(payload(run))), lookup(other, run, "events"), lookup(other, run, "replay")).sequence
      absent <- lookup(owner, run, "replay")
      _ <- saveEvents(owner, run).map(ok)
      _ <- saveReplay(owner, run, envelope(payload(run))).map(ok)
    yield
      status(noScore, Status.Conflict); status(noScoreReplay, Status.Conflict)
      forbidden.foreach(status(_, Status.NotFound))
      assertEquals(ok(absent).hcursor.get[String]("status").toOption, Some("missing_legacy"))
  }

  test("legacy scores remain readable and have explicit missing recordings") {
    for
      owner <- token
      run <- start(owner, selected = false)
      _ <- saveScore(owner, run, submission.copy(objectiveProgress = None)).map(ok)
      reads <- List("events", "replay").traverse(lookup(owner, run, _))
      upload <- saveEvents(owner, run)
    yield
      reads.foreach(r => assertEquals(ok(r).hcursor.get[String]("status").toOption, Some("missing_legacy")))
      status(upload, Status.Conflict)
  }

  test("parallel identical uploads are idempotent; different valid content conflicts") {
    for
      owner <- token
      run <- start(owner)
      _ <- saveScore(owner, run).map(ok)
      savedEvents <- List.fill(3)(summary).parTraverse(saveEvents(owner, run, _))
      savedReplay <- List.fill(3)(envelope(payload(run))).parTraverse(saveReplay(owner, run, _))
      changedSummary <- saveEvents(owner, run, summary.copy(runDurationMs = 1001))
      changed = payload(run).copy(frames = payload(run).frames.map(f => f.copy(camera = f.camera.copy(fov = 60))))
      changedReplay <- saveReplay(owner, run, envelope(changed))
      restored <- lookup(owner, run, "replay")
    yield
      assertEquals(savedEvents.map(ok).distinct.size, 1)
      assertEquals(savedReplay.map(ok).distinct.size, 1)
      status(changedSummary, Status.Conflict); status(changedReplay, Status.Conflict)
      assertEquals(ok(restored).hcursor.get[ReplayEnvelope]("replay").toOption, Some(envelope(payload(run))))
  }

  test("hash, version, frozen world, future events, duplicate objects and score mismatches are rejected") {
    for
      owner <- token
      run <- start(owner)
      _ <- saveScore(owner, run).map(ok)
      p = payload(run)
      malformed = List(
        envelope(p).copy(contentHash = "0" * 64),
        envelope(p.copy(manifest = p.manifest.copy(formatVersion = 2))),
        envelope(p.copy(manifest = p.manifest.copy(config = p.manifest.config.copy(title = "changed")))),
        envelope(p.copy(manifest = p.manifest.copy(world = p.manifest.world.copy(title = "changed")))),
        envelope(p.copy(frames = p.frames.head.copy(throughEventSeq = 0) :: p.frames.tail)),
        envelope(p.copy(frames = p.frames.map(f => f.copy(drones = f.drones :+ f.drones.head)))),
        envelope(p.copy(frames = p.frames.map(f => f.copy(world = f.world.copy(openGateIds = List("unknown-gate")))))),
        envelope(p.copy(frames = List(p.frames.last, p.frames.head))),
        envelope(p.copy(events = List(RunEvent(0, 900, "tool", Some("player"), Some("tool-1"), None, None, Some("curtain")), p.events.head.copy(seq = 1)),
          frames = List(p.frames.head.copy(tools = List(ReplayToolState("tool-1", "curtain", Point3(0, 0, 0), 3, 1000, true))), p.frames.last.copy(throughEventSeq = 1)))),
        envelope(p.copy(events = List(p.events.head.copy(targetId = Some("x" * 81))))))
      rejected <- malformed.traverse(saveReplay(owner, run, _))
      badSummary <- saveEvents(owner, run, summary.copy(events = List(RunEvent(0, 500, "hit", Some("projectile-1"), Some("invented-drone"), None, None, None), summary.events.head.copy(seq = 1))))
      untouched <- api("gettrainingresultapi", auth(owner, "runId" -> run.id.asJson))
      valid <- saveReplay(owner, run, envelope(p))
    yield
      rejected.foreach(status(_, Status.BadRequest)); status(badSummary, Status.BadRequest)
      assertEquals(ok(untouched).hcursor.downField("result").get[Long]("elapsedMs").toOption, Some(1000L))
      ok(valid)
  }

  test("recording budgets are per API and no replay upload can widen credential API limits") {
    for
      owner <- token
      run <- start(owner)
      _ <- saveScore(owner, run).map(ok)
      accepted <- api("saveruneventsapi", auth(owner, "runId" -> run.id.asJson, "summary" -> summary.asJson, "padding" -> s("x" * 20000)))
      smallApi <- api("getruneventsapi", auth(owner, "runId" -> run.id.asJson, "padding" -> s("x" * 20000)))
      largeSummary <- raw("saveruneventsapi", "{\"padding\":\"" + ("x" * (2 * 1024 * 1024)) + "\"}")
      largeReplay <- raw("saverunreplayapi", "{\"padding\":\"" + ("x" * (8 * 1024 * 1024)) + "\"}")
    yield
      ok(accepted); List(smallApi, largeSummary, largeReplay).foreach(status(_, Status.BadRequest))
  }

  test("a real contact explosion is preserved but is never counted as a player kill") {
    for
      owner <- token
      run <- start(owner)
      _ <- saveScore(owner, run).map(ok)
      p = payload(run)
      contact = RunEvent(0, 1000, "contact", Some(run.setup.get.world.drones.head.id), Some("player"), Some(Point3(0, 1, 0)), None, None)
      events = List(contact, summary.events.head.copy(seq = 1))
      finalFrame = p.frames.last.copy(throughEventSeq = 1, drones = p.frames.last.drones.zipWithIndex.map { (drone, index) => if index == 0 then drone.copy(hp = 0, state = "destroyed") else drone })
      valid = p.copy(events = events, frames = List(p.frames.head, finalFrame))
      _ <- saveEvents(owner, run, summary.copy(events = events)).map(ok)
      wrong <- saveReplay(owner, run, envelope(p.copy(events = events, frames = List(p.frames.head, p.frames.last.copy(throughEventSeq = 1)))))
      saved <- saveReplay(owner, run, envelope(valid))
    yield
      status(wrong, Status.BadRequest)
      ok(saved)
  }

  test("ending clips retain original time and sequence, while complete claims require time zero") {
    for
      owner <- token
      run <- start(owner)
      _ <- saveScore(owner, run).map(ok)
      p = payload(run)
      events = summary.events.map(_.copy(seq = 23))
      clip = p.copy(manifest = p.manifest.copy(coverage = p.manifest.coverage.copy(kind = "ending-clip", reason = Some("byte-limit"), fromMs = 500)),
        frames = List(p.frames.head.copy(tMs = 500, scoreElapsedMs = 500, throughEventSeq = 22), p.frames.last.copy(throughEventSeq = 23)), events = events)
      bad <- saveReplay(owner, run, envelope(clip.copy(manifest = clip.manifest.copy(coverage = clip.manifest.coverage.copy(kind = "complete", reason = None)))))
      _ <- saveEvents(owner, run, summary.copy(truncated = true, events = events)).map(ok)
      saved <- saveReplay(owner, run, envelope(clip))
    yield
      status(bad, Status.BadRequest)
      ok(saved)
  }

  test("cross-table event disagreement is rejected in either upload order without overwriting saved data") {
    for
      owner <- token
      first <- start(owner)
      _ <- saveScore(owner, first).map(ok)
      state = RunEvent(0, 500, "drone-state", Some(first.setup.get.world.drones.head.id), None, None, None, Some("alert:lost-sight"))
      firstSummary = summary.copy(events = List(state, summary.events.head.copy(seq = 1)))
      firstReplay = payload(first).copy(events = List(state.copy(tMs = 600), summary.events.head.copy(seq = 1)), frames = List(payload(first).frames.head, payload(first).frames.last.copy(throughEventSeq = 1)))
      _ <- saveEvents(owner, first, firstSummary).map(ok)
      conflictReplay <- saveReplay(owner, first, envelope(firstReplay))
      retainedSummary <- lookup(owner, first, "events")
      absentReplay <- lookup(owner, first, "replay")
      _ <- saveReplay(owner, first, envelope(firstReplay.copy(events = firstSummary.events))).map(ok)
      second <- start(owner)
      _ <- saveScore(owner, second).map(ok)
      secondReplay = payload(second).copy(events = firstReplay.events, frames = List(payload(second).frames.head, payload(second).frames.last.copy(throughEventSeq = 1)))
      _ <- saveReplay(owner, second, envelope(secondReplay)).map(ok)
      conflictSummary <- saveEvents(owner, second, firstSummary)
      retainedReplay <- lookup(owner, second, "replay")
      absentSummary <- lookup(owner, second, "events")
      score <- api("gettrainingresultapi", auth(owner, "runId" -> second.id.asJson))
      _ <- saveEvents(owner, second, firstSummary.copy(events = secondReplay.events)).map(ok)
    yield
      status(conflictReplay, Status.Conflict); status(conflictSummary, Status.Conflict)
      assertEquals(ok(retainedSummary).hcursor.get[RunEventSummary]("summary").toOption, Some(firstSummary))
      assertEquals(ok(retainedReplay).hcursor.get[ReplayEnvelope]("replay").toOption, Some(envelope(secondReplay)))
      List(absentReplay, absentSummary).foreach(r => assertEquals(ok(r).hcursor.get[String]("status").toOption, Some("missing_legacy")))
      assert(!ok(score).hcursor.downField("result").focus.get.isNull)
  }

  test("complete process records cannot omit counterpart events; two fragments compare only their overlap") {
    for
      owner <- token
      run <- start(owner)
      _ <- saveScore(owner, run).map(ok)
      state = RunEvent(0, 500, "drone-state", Some(run.setup.get.world.drones.head.id), None, None, None, Some("alert:lost-sight"))
      allEvents = List(state, state.copy(seq = 1, tMs = 700, detail = Some("scanning:search-ended")), summary.events.head.copy(seq = 2))
      p = payload(run)
      _ <- saveEvents(owner, run, summary.copy(events = List(allEvents.head, allEvents.last))).map(ok)
      omitted <- saveReplay(owner, run, envelope(p.copy(events = allEvents, frames = List(p.frames.head, p.frames.last.copy(throughEventSeq = 2)))))
      fragmented <- start(owner)
      _ <- saveScore(owner, fragmented).map(ok)
      fp = payload(fragmented)
      end = summary.events.head.copy(seq = 5)
      clippedSummary = summary.copy(truncated = true, events = List(state.copy(seq = 4, tMs = 700), end))
      clip = fp.copy(manifest = fp.manifest.copy(coverage = fp.manifest.coverage.copy(kind = "ending-clip", reason = Some("byte-limit"), fromMs = 500)),
        frames = List(fp.frames.head.copy(tMs = 500, scoreElapsedMs = 500, throughEventSeq = 2), fp.frames.last.copy(throughEventSeq = 5)),
        events = List(state.copy(seq = 3, tMs = 600), end))
      _ <- saveEvents(owner, fragmented, clippedSummary).map(ok)
      accepted <- saveReplay(owner, fragmented, envelope(clip))
    yield
      status(omitted, Status.Conflict)
      ok(accepted)
  }

  test("racing contradictory uploads serialize on the run and commit exactly one process record") {
    for
      owner <- token
      run <- start(owner)
      _ <- saveScore(owner, run).map(ok)
      state = RunEvent(0, 500, "drone-state", Some(run.setup.get.world.drones.head.id), None, None, None, Some("alert:lost-sight"))
      eventSummary = summary.copy(events = List(state, summary.events.head.copy(seq = 1)))
      p = payload(run)
      replay = p.copy(events = List(state.copy(tMs = 600), summary.events.head.copy(seq = 1)), frames = List(p.frames.head, p.frames.last.copy(throughEventSeq = 1)))
      replies <- (saveEvents(owner, run, eventSummary), saveReplay(owner, run, envelope(replay))).parTupled
      stored <- List("events", "replay").traverse(lookup(owner, run, _))
    yield
      assertEquals(List(replies._1, replies._2).count(_.status == Status.Ok), 1)
      assertEquals(List(replies._1, replies._2).count(_.status == Status.Conflict), 1)
      assertEquals(stored.map(ok).count(_.hcursor.get[String]("status").toOption.contains("available")), 1)
  }

  test("unsupported stored format is explicit and replay failure never rolls back saved score") {
    for
      owner <- token
      run <- start(owner)
      _ <- saveScore(owner, run).map(ok)
      _ <- saveEvents(owner, run).map(ok)
      invalid <- saveReplay(owner, run, envelope(payload(run)).copy(contentHash = "bad"))
      events <- lookup(owner, run, "events")
      _ <- saveReplay(owner, run, envelope(payload(run))).map(ok)
      _ <- database().transaction(connection => IO.blocking {
        Using.resource(connection.prepareStatement("UPDATE run_replays SET format_version=2 WHERE run_id=?")) { st => st.setObject(1, run.id.value); st.executeUpdate(); () }
      })
      unsupported <- lookup(owner, run, "replay")
      score <- api("gettrainingresultapi", auth(owner, "runId" -> run.id.asJson))
    yield
      status(invalid, Status.BadRequest)
      assertEquals(ok(events).hcursor.get[String]("status").toOption, Some("available"))
      assertEquals(ok(unsupported), Json.obj("status" -> s("unsupported_version"), "formatVersion" -> Json.fromInt(2)))
      assert(!ok(score).hcursor.downField("result").focus.get.isNull)
  }

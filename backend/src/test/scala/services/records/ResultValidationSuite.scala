package services.records

import cats.effect.IO
import io.circe.parser.decode
import munit.CatsEffectSuite
import services.player.objects.PlayerId
import services.records.api.ListMyResultsAPIMessage
import services.records.objects.{ResultOutcome, ResultSubmission, TrainingResult}
import services.records.utils.ResultValidation
import services.system.objects.{ErrorCode, HttpError}
import services.training.objects.{DroneRules, DroneSpawn, RunId, TerrainConfig, TrainingConfig, TrainingConfigId, TrainingRun, TrainingRunStatus, WeaponConfig}
import java.time.Instant
import java.util.UUID

class ResultValidationSuite extends CatsEffectSuite:
  private val terrain = TerrainConfig(1.5, 5, 1, -1, 0.2)
  private val config = TrainingConfig(
    TrainingConfigId(UUID.fromString("c8137000-0000-4000-8000-000000000001")),
    "test-rules",
    "四架无人机",
    terrain,
    DroneRules(
      maxHp = 3, scanRange = 13, scanFovDegrees = 90, scanSpeed = 0.6,
      alertSpeed = 3, alertSeconds = 2, hitScanSeconds = 2, lostSightSeconds = 2,
      patrolSpeed = 1.4, chaseSpeed = 4, patrolRadius = 4, contactRadius = 1.2,
      spawnGraceSeconds = 4,
      spawns = List(DroneSpawn(0, 0, 0), DroneSpawn(4, 0, 1), DroneSpawn(0, 4, 2), DroneSpawn(4, 4, 3))
    ),
    WeaponConfig(250, 30, 40)
  )
  private val playerId = PlayerId(UUID.fromString("82156398-7451-485d-81be-c7793ff4471d"))
  private val run = TrainingRun(
    RunId(UUID.fromString("36c1154e-49c6-4ada-9f72-bbe864d8bb2e")), playerId,
    UUID.fromString("f760f03e-6845-42c9-a727-dd471405ea59"), config, terrain,
    TrainingRunStatus.Open, Instant.parse("2026-11-01T01:00:00Z"), None
  )
  private val victory = ResultSubmission(ResultOutcome.Victory, 12, 12, 4, 2500)

  private def rejects(submission: ResultSubmission): IO[Unit] =
    interceptIO[HttpError](ResultValidation.validateSubmission(run, submission)).map { error =>
      assertEquals(error.code, ErrorCode.ValidationError)
    }

  test("victory accepts all four kills at the permitted one-interval timing boundary") {
    ResultValidation.validateSubmission(run, victory)
  }

  test("defeat accepts damage on survivors and zero-shot contact loss") {
    for
      _ <- ResultValidation.validateSubmission(run, ResultSubmission(ResultOutcome.Defeat, 5, 5, 1, 750))
      _ <- ResultValidation.validateSubmission(run, ResultSubmission(ResultOutcome.Defeat, 0, 0, 0, 0))
    yield ()
  }

  test("one millisecond below the allowed fire timing is rejected") {
    rejects(victory.copy(elapsedMs = 2499))
  }

  test("negative counts and elapsed time are rejected") {
    for
      _ <- rejects(victory.copy(shotsFired = -1))
      _ <- rejects(victory.copy(hits = -1))
      _ <- rejects(victory.copy(destroyed = -1))
      _ <- rejects(victory.copy(elapsedMs = -1))
    yield ()
  }

  test("hits cannot exceed shots and kills cannot exceed the spawn count") {
    for
      _ <- rejects(victory.copy(shotsFired = 11))
      _ <- rejects(victory.copy(destroyed = 5))
    yield ()
  }

  test("each reported kill consumes the configured HP") {
    rejects(ResultSubmission(ResultOutcome.Defeat, 5, 5, 2, 750))
  }

  test("surviving drones cannot have absorbed enough damage to be dead") {
    rejects(ResultSubmission(ResultOutcome.Defeat, 10, 10, 1, 2000))
  }

  test("victory must kill every drone and defeat must retain a survivor") {
    for
      _ <- rejects(ResultSubmission(ResultOutcome.Victory, 9, 9, 3, 1750))
      _ <- rejects(victory.copy(outcome = ResultOutcome.Defeat))
    yield ()
  }

  test("resource bounds reject overlarge finite inputs without overflow") {
    for
      _ <- rejects(victory.copy(elapsedMs = 86400001L))
      _ <- rejects(victory.copy(elapsedMs = Long.MaxValue))
      _ <- rejects(victory.copy(shotsFired = Int.MaxValue, elapsedMs = 86400000L))
      _ <- rejects(victory.copy(shotsFired = 1000001, elapsedMs = 86400000L))
    yield ()
  }

  test("JSON rejects fractional, overflowing, missing and null required counters") {
    val payloads = List(
      """{"outcome":"victory","shotsFired":12.5,"hits":12,"destroyed":4,"elapsedMs":2500}""",
      """{"outcome":"victory","shotsFired":2147483648,"hits":12,"destroyed":4,"elapsedMs":2500}""",
      """{"outcome":"victory","shotsFired":12,"hits":12,"destroyed":4,"elapsedMs":9223372036854775808}""",
      """{"outcome":"victory","shotsFired":12,"hits":12,"destroyed":4,"elapsedMs":1.5}""",
      """{"outcome":"victory","shotsFired":12,"hits":12,"destroyed":4}""",
      """{"outcome":"victory","shotsFired":12,"hits":null,"destroyed":4,"elapsedMs":2500}"""
    )
    payloads.foreach(payload => assert(decode[ResultSubmission](payload).isLeft, payload))
  }

  test("outcome is a closed exact wire enum") {
    assertEquals(decode[ResultOutcome]("\"victory\""), Right(ResultOutcome.Victory))
    assertEquals(decode[ResultOutcome]("\"defeat\""), Right(ResultOutcome.Defeat))
    List("Victory", " victory", "defeat ", "draw", "completed").foreach { invalid =>
      assert(decode[ResultOutcome](s"\"$invalid\"").isLeft)
    }
  }

  test("submission counters and elapsed time reject numeric strings") {
    val payloads = List(
      """{"outcome":"victory","shotsFired":"12","hits":12,"destroyed":4,"elapsedMs":2500}""",
      """{"outcome":"victory","shotsFired":12,"hits":"12","destroyed":4,"elapsedMs":2500}""",
      """{"outcome":"victory","shotsFired":12,"hits":12,"destroyed":"4","elapsedMs":2500}""",
      """{"outcome":"victory","shotsFired":12,"hits":12,"destroyed":4,"elapsedMs":"2500"}"""
    )
    payloads.foreach(payload => assert(decode[ResultSubmission](payload).isLeft, payload))
    assertEquals(
      decode[ResultSubmission]("""{"outcome":"victory","shotsFired":12,"hits":12,"destroyed":4,"elapsedMs":2500}"""),
      Right(victory)
    )
  }

  test("pagination JSON rejects numeric strings while retaining integer input") {
    val prefix = s"""{"playerId":"${playerId.value}","""
    assert(decode[ListMyResultsAPIMessage](prefix + """"offset":"0","limit":10}""").isLeft)
    assert(decode[ListMyResultsAPIMessage](prefix + """"offset":0,"limit":"10"}""").isLeft)
    assert(decode[ListMyResultsAPIMessage](prefix + """"offset":0.5,"limit":10}""").isLeft)
    assert(decode[ListMyResultsAPIMessage](prefix + """"offset":0,"limit":2147483648}""").isLeft)
    assertEquals(
      decode[ListMyResultsAPIMessage](prefix + """"offset":0,"limit":10}"""),
      Right(ListMyResultsAPIMessage(playerId, 0, 10))
    )
  }

  test("idempotence compares every submitted field") {
    val result = TrainingResult(run.id, playerId, config.id, config.version, terrain,
      victory.outcome, victory.shotsFired, victory.hits, victory.destroyed,
      victory.elapsedMs, 1.0, run.startedAt)
    assert(ResultValidation.sameSubmission(result, victory))
    val different = List(
      victory.copy(outcome = ResultOutcome.Defeat), victory.copy(shotsFired = 13),
      victory.copy(hits = 11), victory.copy(destroyed = 3), victory.copy(elapsedMs = 2501)
    )
    different.foreach(submission => assert(!ResultValidation.sameSubmission(result, submission)))
  }

  test("pagination accepts boundaries and rejects excessive scans") {
    for
      _ <- ResultValidation.validatePagination(0, 1)
      _ <- ResultValidation.validatePagination(10000, 50)
      _ <- interceptIO[HttpError](ResultValidation.validatePagination(-1, 10))
      _ <- interceptIO[HttpError](ResultValidation.validatePagination(10001, 10))
      _ <- interceptIO[HttpError](ResultValidation.validatePagination(0, 0))
      _ <- interceptIO[HttpError](ResultValidation.validatePagination(0, 51))
    yield ()
  }

  test("personal-best terrain filter rejects nonfinite values and invalid bounds") {
    for
      _ <- ResultValidation.validateBestFilter(config.version, terrain)
      _ <- interceptIO[HttpError](ResultValidation.validateBestFilter("", terrain))
      _ <- interceptIO[HttpError](ResultValidation.validateBestFilter(config.version, terrain.copy(hillHeight = Double.NaN)))
      _ <- interceptIO[HttpError](ResultValidation.validateBestFilter(config.version, terrain.copy(hillWidth = Double.PositiveInfinity)))
      _ <- interceptIO[HttpError](ResultValidation.validateBestFilter(config.version, terrain.copy(hillHeight = 4.01)))
      _ <- interceptIO[HttpError](ResultValidation.validateBestFilter(config.version, terrain.copy(hillWidth = 2.4)))
      _ <- interceptIO[HttpError](ResultValidation.validateBestFilter(config.version, terrain.copy(hillX = -8.1)))
      _ <- interceptIO[HttpError](ResultValidation.validateBestFilter(config.version, terrain.copy(hillZ = 8.1)))
      _ <- interceptIO[HttpError](ResultValidation.validateBestFilter(config.version, terrain.copy(ripple = 0.81)))
    yield ()
  }

package services

import io.circe.{Decoder, Encoder, Json, parser}
import io.circe.syntax.*
import java.nio.file.{Files, Path}
import munit.FunSuite
import services.player.objects.PlayerProfile
import services.player.objects.apiTypes.AuthResponse
import services.records.objects.TrainingResult
import services.records.objects.apiTypes.{PersonalBestResponse, ResultListResponse, ResultLookupResponse}
import services.training.objects.{TrainingConfig, TrainingRun}
import services.training.objects.apiTypes.AbandonRunResponse

/** A single versioned fixture is consumed by the TypeScript and Scala boundary tests. */
class ContractFixtureSuite extends FunSuite:
  private lazy val fixture = parser.parse(Files.readString(Path.of("../frontend/tests/fixtures/contract.json"))).fold(throw _, identity)

  private def check[A: Decoder: Encoder](key: String): Unit =
    val json = fixture.hcursor.downField(key).focus.getOrElse(fail(s"Missing shared fixture $key"))
    val decoded = json.as[A].fold(error => fail(error.getMessage), identity)
    assertEquals(decoded.asJson, json, s"Scala and TypeScript disagree about $key")

  test("shared player, authentication and frozen-run DTOs round-trip without shape changes") {
    check[PlayerProfile]("player")
    check[AuthResponse]("auth")
    check[TrainingConfig]("config")
    check[TrainingRun]("run")
    check[AbandonRunResponse]("abandoned")
  }

  test("shared result, nullable lookup, history and best DTOs round-trip") {
    check[TrainingResult]("result")
    check[ResultLookupResponse]("lookup")
    check[ResultListResponse]("list")
    check[PersonalBestResponse]("best")
  }

  test("frontend fixture configuration equals the exact rules bundled in the backend") {
    val resource = parser.parse(Files.readString(Path.of("src/main/resources/game-config.json"))).fold(throw _, identity)
    assertEquals(fixture.hcursor.downField("config").focus, Some(resource))
  }
  test("time codecs reject missing zones, impossible dates and non-strings") {
    import services.system.objects.TimeCodecs.given
    List(Json.fromString("2026-11-01T12:00:00"), Json.fromString("2026-13-01T12:00:00Z"), Json.fromInt(123))
      .foreach(value => assert(value.as[java.time.Instant].isLeft))
  }

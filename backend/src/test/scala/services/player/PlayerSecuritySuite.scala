package services.player

import cats.effect.IO
import io.circe.Json
import io.circe.parser.decode
import io.circe.syntax.*
import munit.CatsEffectSuite
import services.player.api.{LoginPlayerAPIMessage, RegisterPlayerAPIMessage}
import services.player.objects.{PlayerId, PlayerProfile, SessionId, SessionToken, StoredPlayer}
import services.player.objects.apiTypes.AuthResponse
import services.player.utils.{PlayerSecrets, PlayerValidation}
import services.system.objects.{ErrorCode, HttpError}
import java.time.Instant
import java.util.UUID
import scala.compiletime.testing.typeChecks

final class PlayerSecuritySuite extends CatsEffectSuite:
  private val id = PlayerId(UUID.fromString("d8ce21d1-56a5-45a7-a927-81f93bf2fbb0"))
  private val now = Instant.parse("2026-11-01T00:00:00Z")

  test("player and session IDs reject abbreviated Java UUID forms") {
    assert(decode[PlayerId]("\"1-1-1-1-1\"").isLeft)
    assert(decode[SessionId]("\"1-1-1-1-1\"").isLeft)
    assertEquals(decode[PlayerId](id.asJson.noSpaces), Right(id))
    assert(!typeChecks("services.player.objects.PlayerId(java.util.UUID.randomUUID()): services.player.objects.SessionId"))
  }

  test("wire codecs require actual strings and complete registration fields") {
    assert(Json.fromInt(12).as[PlayerId].isLeft)
    assert(decode[RegisterPlayerAPIMessage]("""{"username":"visitor","password":"Password123"}""").isLeft)
    assert(decode[LoginPlayerAPIMessage]("""{"username":"visitor","password":12345678}""").isLeft)
    assert(decode[SessionToken]("\"bad-token\"").isLeft)
  }

  test("username normalization and ASCII limits are shared between registration and login") {
    assertEquals(PlayerValidation.normalizeUsername("  Meadow_123  "), "meadow_123")
    for
      _ <- PlayerValidation.validateUsername("meadow_123")
      short <- PlayerValidation.validateUsername("ab").attempt
      unicode <- PlayerValidation.validateUsername("用户123").attempt
      tooLong <- PlayerValidation.validateUsername("x" * 25).attempt
    yield
      assertValidation(short)
      assertValidation(unicode)
      assertValidation(tooLong)
  }

  test("password validation counts characters and separately bounds UTF-8 bytes") {
    for
      _ <- PlayerValidation.validatePassword("密码安全至少八字")
      _ <- PlayerValidation.validatePassword(" " * 8)
      _ <- PlayerValidation.validatePassword("a" * 128)
      tooShort <- PlayerValidation.validatePassword("abc1234").attempt
      tooManyBytes <- PlayerValidation.validatePassword("汉" * 43).attempt
      tooLong <- PlayerValidation.validatePassword("a" * 129).attempt
    yield
      assertValidation(tooShort)
      assertValidation(tooManyBytes)
      assertValidation(tooLong)
  }

  test("nickname supports 24 Unicode code points and rejects control characters") {
    for
      _ <- PlayerValidation.validateNickname("🐉" * 24)
      empty <- PlayerValidation.validateNickname("").attempt
      long <- PlayerValidation.validateNickname("🐉" * 25).attempt
      control <- PlayerValidation.validateNickname("奶龙\n玩家").attempt
    yield
      assertValidation(empty)
      assertValidation(long)
      assertValidation(control)
  }

  test("random salt changes password hash and whitespace is preserved") {
    for
      firstSalt <- PlayerSecrets.newSalt()
      secondSalt <- PlayerSecrets.newSalt()
      firstHash <- PlayerSecrets.hashPassword(" Password123 ", firstSalt, PlayerSecrets.passwordIterations)
      secondHash <- PlayerSecrets.hashPassword(" Password123 ", secondSalt, PlayerSecrets.passwordIterations)
      stored = StoredPlayer(id, "meadow", "奶龙", firstHash, firstSalt, PlayerSecrets.passwordIterations, now)
      exact <- PlayerSecrets.verifyPassword(" Password123 ", Some(stored))
      trimmed <- PlayerSecrets.verifyPassword("Password123", Some(stored))
      missing <- PlayerSecrets.verifyPassword(" Password123 ", None)
    yield
      assert(PlayerSecrets.passwordIterations >= 210000)
      assertNotEquals(firstSalt, secondSalt)
      assertNotEquals(firstHash, secondHash)
      assertEquals(firstSalt.length, 32)
      assertEquals(firstHash.length, 64)
      assert(exact)
      assert(!trimmed)
      assert(!missing)
  }

  test("session tokens have 256 bits of random material and stable SHA256 storage digests") {
    for
      first <- PlayerSecrets.newToken()
      second <- PlayerSecrets.newToken()
      hash <- PlayerSecrets.hashToken(first)
      again <- PlayerSecrets.hashToken(first)
    yield
      assertNotEquals(first, second)
      assert(first.value.matches("[A-Za-z0-9_-]{43}"))
      assertEquals(java.util.Base64.getUrlDecoder.decode(first.value).length, 32)
      assertEquals(hash.length, 64)
      assertEquals(hash, again)
      assertNotEquals(hash, first.value)
  }

  test("public auth JSON contains only profile, raw newly issued token and expiry") {
    val response = AuthResponse(PlayerProfile(id, "meadow", "奶龙", now), SessionToken("a" * 43), now.plusSeconds(604800))
    val json = response.asJson
    assertEquals(json.asObject.get.keys.toSet, Set("player", "userToken", "expiresAt"))
    assertEquals(json.hcursor.downField("player").focus.get.asObject.get.keys.toSet, Set("id", "username", "nickname", "createdAt"))
    assert(!typeChecks("summon[io.circe.Encoder[services.player.objects.StoredPlayer]]"))
    assert(!typeChecks("summon[io.circe.Encoder[services.player.objects.StoredSession]]"))
  }

  private def assertValidation(result: Either[Throwable, Unit]): Unit = result match
    case Left(error: HttpError) => assertEquals(error.code, ErrorCode.ValidationError)
    case other => fail(s"Expected validation error, got $other")
